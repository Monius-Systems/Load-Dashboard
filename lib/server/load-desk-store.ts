import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeKey,
  normalizeName,
  type ClientProfile,
  type CompanyProfile,
  type CustomerProfile,
  type TruckProfile,
} from '@/lib/load-desk/profiles';
import {
  applyRecordEdit,
  invoiceKeyOf,
  ticketDateColumn,
  type NewClient,
  type NewCompany,
  type NewCustomer,
  type NewRecord,
  type NewTruck,
  type ProfileKind,
  type RecordEdit,
} from '@/lib/load-desk/record-input';

type NewProfile = NewCustomer | NewTruck | NewCompany | NewClient;
import type { SavedRecord } from '@/lib/load-desk/types';
import { stampedReview } from '@/lib/load-desk/duplicates';
import { authSettings } from '@/lib/server/auth';

// Supabase storage for a client workspace. Every function is given the
// workspace of the person making the request — there is no default and no
// global to fall back to, so a query cannot reach another company's rows by
// omission. Each one also runs as the signed-in user, so row level security
// (see supabase/migrations) enforces the same boundary in the database.

export const ORIGINALS_BUCKET = 'load-desk-originals';
const PAGE_SIZE = 1000;
const objectPath = (workspace: string, sha256: string) => `${workspace}/${sha256}`;

/** An error with a user-facing message and an HTTP status. */
export class StoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const unavailable = (what: string) =>
  new StoreError(`Could not ${what}. Please try again.`, 503);

export async function listRecords(client: SupabaseClient, workspace: string): Promise<SavedRecord[]> {
  const records: SavedRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('load_desk_records')
      .select('id, record')
      .eq('workspace_id', workspace)
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw unavailable('load saved tickets');
    for (const row of data) {
      records.push({
        ...(row.record as Omit<SavedRecord, 'id'>),
        id: Number(row.id),
      });
    }
    if (data.length < PAGE_SIZE) return records;
  }
}

/**
 * Saves a ticket. Its invoice number is claimed for its upload (batch); a
 * number another upload already uses is refused, and the same file page
 * cannot be saved twice.
 */
export async function saveRecord(
  client: SupabaseClient,
  workspace: string,
  sent: NewRecord,
  /** Who is saving, for a suspected duplicate's history. */
  actor: string | null = null,
): Promise<SavedRecord> {
  // A page held as a suspected duplicate starts its history here, stamped with
  // who saved it rather than whatever the browser said.
  const review = stampedReview(undefined, sent.duplicate_review, actor, new Date().toISOString());
  const record: NewRecord = review ? { ...sent, duplicate_review: review } : sent;
  const invoiceKey = invoiceKeyOf(record.invoice.invoice_number);
  const claim = await client.from('load_desk_invoices').insert({
    workspace_id: workspace,
    invoice_key: invoiceKey,
    batch_id: record.invoice_batch_id,
  });
  const claimedNow = !claim.error;
  if (claim.error) {
    if (claim.error.code !== '23505') throw unavailable('save the invoice number');
    const existing = await client
      .from('load_desk_invoices')
      .select('batch_id')
      .eq('workspace_id', workspace)
      .eq('invoice_key', invoiceKey)
      .maybeSingle();
    if (existing.error) throw unavailable('check the invoice number');
    if (existing.data?.batch_id !== record.invoice_batch_id) {
      throw new StoreError(
        `Invoice number ${record.invoice.invoice_number} is already used by another upload. Choose another.`,
        409,
      );
    }
  }

  const page = record.source.page ?? 1;
  const inserted = await client
    .from('load_desk_records')
    .insert({
      workspace_id: workspace,
      invoice_key: invoiceKey,
      batch_id: record.invoice_batch_id,
      source_sha256: record.source.sha256,
      source_page: page,
      ticket_date: ticketDateColumn(record.ticket),
      record,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) {
    if (claimedNow) {
      // Release the number again; the trigger only runs on ticket deletes.
      await client
        .from('load_desk_invoices')
        .delete()
        .eq('workspace_id', workspace)
        .eq('invoice_key', invoiceKey);
    }
    if (inserted.error?.code === '23505') {
      const duplicate = await client
        .from('load_desk_records')
        .select('id')
        .eq('workspace_id', workspace)
        .eq('source_sha256', record.source.sha256)
        .eq('source_page', page)
        .maybeSingle();
      throw new StoreError(
        duplicate.data
          ? `This file is already saved as record ${duplicate.data.id}. Nothing was added.`
          : 'This file is already saved. Nothing was added.',
        409,
      );
    }
    throw unavailable('save the ticket');
  }
  return { ...record, id: Number(inserted.data.id) };
}

/**
 * Saves changes to saved tickets in one transaction (load_desk_update_records):
 * all of them change or none do. The stored source file, upload and first save
 * time are kept; a changed invoice number is claimed for the tickets' upload
 * and refused when another upload uses it.
 */
export async function updateRecords(
  client: SupabaseClient,
  workspace: string,
  edits: RecordEdit[],
  /** Who is making the changes, for a suspected duplicate's history. */
  actor: string | null = null,
): Promise<SavedRecord[]> {
  const { data, error } = await client
    .from('load_desk_records')
    .select('id, record')
    .eq('workspace_id', workspace)
    .in(
      'id',
      edits.map((edit) => edit.id),
    );
  if (error) throw unavailable('load the tickets to change');
  const stored = new Map(
    data.map((row) => [Number(row.id), row.record as Omit<SavedRecord, 'id'>]),
  );
  const editedAt = new Date().toISOString();
  const updated: SavedRecord[] = [];
  for (const edit of edits) {
    const record = stored.get(edit.id);
    if (!record) {
      throw new StoreError('A ticket you changed no longer exists. Reload and try again.', 404);
    }
    updated.push({ ...applyRecordEdit(record, edit, editedAt, actor), id: edit.id });
  }
  const result = await client.rpc('load_desk_update_records', {
    target_workspace: workspace,
    changes: updated.map(({ id, ...record }) => ({
      id,
      ticket_date: ticketDateColumn(record.ticket),
      // Only when the ticket is moving to another invoice; otherwise the row
      // keeps the upload it was saved with.
      ...(record.invoice_batch_id ? { batch_id: record.invoice_batch_id } : {}),
      record,
    })),
  });
  if (result.error) {
    if (/invoice_taken/.test(result.error.message)) {
      // A ticket moving to another invoice takes that invoice's number, which
      // is claimed by the other upload — allowed since the move migration
      // (202609180001), refused by the function before it. The refusal reads
      // the same either way, so say what is really wrong: the database is
      // behind the app, not the number.
      const moving = edits.find((edit) => edit.invoice_batch_id);
      if (moving) {
        throw new StoreError(
          'Moving a ticket onto another invoice needs the database update in supabase/migrations/202609180001_move_ticket_invoice.sql. Apply it with `supabase db push`, then save again.',
          409,
        );
      }
      throw new StoreError(
        `Invoice number ${edits[0].invoice.invoice_number} is already used by another upload. Choose another.`,
        409,
      );
    }
    if (result.error.code === 'P0002') {
      throw new StoreError('A ticket you changed no longer exists. Reload and try again.', 404);
    }
    throw unavailable('save the changes');
  }
  return updated;
}

/** Deletes a ticket, and its scan when no other saved ticket uses it. */
export async function deleteRecord(client: SupabaseClient, workspace: string, id: number) {
  const { data, error } = await client
    .from('load_desk_records')
    .delete()
    .eq('workspace_id', workspace)
    .eq('id', id)
    .select('source_sha256');
  if (error) throw unavailable('delete the ticket');
  if (!data.length) throw new StoreError('That ticket no longer exists.', 404);
  const sha256 = data[0].source_sha256 as string;
  const others = await client
    .from('load_desk_records')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspace)
    .eq('source_sha256', sha256);
  if (!others.error && (others.count ?? 0) === 0) {
    // A leftover scan is unreachable; a failed cleanup is not an error.
    await client.storage.from(ORIGINALS_BUCKET).remove([objectPath(workspace, sha256)]);
  }
}

export async function listProfiles(client: SupabaseClient, workspace: string): Promise<{
  customers: CustomerProfile[];
  trucks: TruckProfile[];
  clients: ClientProfile[];
  company: CompanyProfile | null;
}> {
  const customers: CustomerProfile[] = [];
  const trucks: TruckProfile[] = [];
  const clients: ClientProfile[] = [];
  let company: CompanyProfile | null = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('load_desk_profiles')
      .select('id, kind, profile')
      .eq('workspace_id', workspace)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw unavailable('load customers and trucks');
    for (const row of data) {
      if (row.kind === 'customer') {
        customers.push({ ...(row.profile as NewCustomer), id: Number(row.id) });
      } else if (row.kind === 'truck') {
        trucks.push({ ...(row.profile as NewTruck), id: Number(row.id) });
      } else if (row.kind === 'client') {
        clients.push({ ...(row.profile as NewClient), id: Number(row.id) });
      } else if (row.kind === 'company' && !company) {
        company = { ...(row.profile as NewCompany), id: Number(row.id) };
      }
    }
    if (data.length < PAGE_SIZE) return { customers, trucks, clients, company };
  }
}

/**
 * Customer numbers and truck numbers must stay unique within the workspace,
 * and a workspace has one company profile.
 */
async function assertUnique(
  client: SupabaseClient,
  workspace: string,
  kind: ProfileKind,
  profile: NewProfile,
  exceptId: number | null,
) {
  const { customers, trucks, clients, company } = await listProfiles(client, workspace);
  if (kind === 'company') {
    if (company && company.id !== exceptId) {
      throw new StoreError('The invoice address was just saved elsewhere. Reload and try again.', 409);
    }
    return;
  }
  if (kind === 'client') {
    const name = normalizeName((profile as NewClient).name);
    const clash = clients.find(
      (other) => other.id !== exceptId && normalizeName(other.name) === name,
    );
    if (clash) {
      throw new StoreError(`${clash.name} already has a client profile.`, 409);
    }
    return;
  }
  if (kind === 'truck') {
    const number = normalizeKey((profile as NewTruck).truck_number);
    const clash = trucks.find(
      (truck) => truck.id !== exceptId && normalizeKey(truck.truck_number) === number,
    );
    if (clash) {
      throw new StoreError(`Truck #${clash.truck_number} already has a profile.`, 409);
    }
    return;
  }
  const ids = (profile as NewCustomer).ticket_customer_ids.map(normalizeKey);
  const clash = customers.find(
    (customer) =>
      customer.id !== exceptId &&
      customer.ticket_customer_ids.some((value) => ids.includes(normalizeKey(value))),
  );
  if (clash) {
    throw new StoreError(
      `A customer number here already belongs to ${clash.name}. Each number can match one customer.`,
      409,
    );
  }
}

export async function createProfile(
  client: SupabaseClient,
  workspace: string,
  kind: ProfileKind,
  profile: NewProfile,
): Promise<number> {
  await assertUnique(client, workspace, kind, profile, null);
  const { data, error } = await client
    .from('load_desk_profiles')
    .insert({ workspace_id: workspace, kind, profile })
    .select('id')
    .single();
  if (error?.code === '23505' && kind === 'company') {
    throw new StoreError('The invoice address was just saved elsewhere. Reload and try again.', 409);
  }
  if (error || !data) throw unavailable(`save the ${kind}`);
  return Number(data.id);
}

export async function updateProfile(
  client: SupabaseClient,
  workspace: string,
  id: number,
  kind: ProfileKind,
  profile: NewProfile,
) {
  await assertUnique(client, workspace, kind, profile, id);
  const { data, error } = await client
    .from('load_desk_profiles')
    .update({ profile, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspace)
    .eq('id', id)
    .eq('kind', kind)
    .select('id');
  if (error) throw unavailable(`save the ${kind}`);
  if (!data.length) throw new StoreError(`That ${kind} no longer exists.`, 404);
}

export async function deleteProfile(client: SupabaseClient, workspace: string, id: number) {
  const { data, error } = await client
    .from('load_desk_profiles')
    .delete()
    .eq('workspace_id', workspace)
    .eq('id', id)
    .select('id');
  if (error) throw unavailable('delete the profile');
  if (!data.length) throw new StoreError('That profile no longer exists.', 404);
}

/** Stores a scan under its SHA-256, after checking the bytes match it. */
export async function uploadOriginal(
  client: SupabaseClient,
  workspace: string,
  sha256: string,
  body: ArrayBuffer,
  contentType: string,
) {
  const digest = await crypto.subtle.digest('SHA-256', body);
  const actual = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (actual !== sha256) {
    throw new StoreError('The uploaded file does not match its fingerprint.', 400);
  }
  const { error } = await client.storage
    .from(ORIGINALS_BUCKET)
    .upload(objectPath(workspace, sha256), body, { contentType, upsert: false });
  // Identical bytes are already stored under the same name.
  const alreadyStored =
    error && /already exists|duplicate/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`);
  if (error && !alreadyStored) throw unavailable('store the original file');
}

/**
 * A stored original as a stream from the bucket, or null when it is not
 * there. The response is the storage service's own, body unread: the route
 * hands the stream on, and the file never sits in the worker's memory.
 *
 * The client library's `download()` buffers the whole object as a Blob, and
 * a review opening an invoice fetches every ticket's photograph at once —
 * eight scans of several megabytes each, all buffered in one isolate, is
 * how a worker runs out of memory and answers everything, the page
 * included, with "exceeded resource limits". The bucket's own endpoint is
 * fetched instead, with the member's token, so the bucket's policies still
 * decide what they may read.
 */
export async function downloadOriginal(
  client: SupabaseClient,
  workspace: string,
  sha256: string,
): Promise<Response | null> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  const settings = authSettings();
  if (!token || !settings.url || !settings.key) return null;
  const path = objectPath(workspace, sha256)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const upstream = await fetch(
    `${settings.url.replace(/\/$/, '')}/storage/v1/object/authenticated/${ORIGINALS_BUCKET}/${path}`,
    { headers: { Authorization: `Bearer ${token}`, apikey: settings.key } },
  );
  if (!upstream.ok || !upstream.body) {
    // Not read: a body left unread is a connection left open.
    await upstream.body?.cancel();
    return null;
  }
  return upstream;
}
