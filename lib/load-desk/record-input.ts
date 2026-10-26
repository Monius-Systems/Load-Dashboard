import {
  isFuelType,
  isRateType,
  NUMBER_FIELDS,
  TEXT_FIELDS,
  type InvoiceDraft,
  type SavedRecord,
  type Ticket,
  type TicketSource,
} from './types.ts';
import type {
  ClientProfile,
  CompanyProfile,
  CustomerProfile,
  TruckProfile,
} from './profiles.ts';
import type {
  ClippedEdge,
  EdgeState,
  EvidenceSource,
  FieldResolution,
  FieldStatus,
  ReviewReason,
  TicketRecovery,
} from './recovery/contract.ts';
import { customerLocationRates, type LocationRate } from './customer-rates.ts';
import { datedFromTicket } from './invoice-dates.ts';
import { parseDuplicateReview, stampedReview, type DuplicateReview } from './duplicates.ts';
import { DUPLICATE_BATCH, pendingInvoiceNumber } from './records.ts';
import { ticketDay } from './ticket-date.ts';

// Validation for data the browser sends to the server. Everything is checked
// field by field and bounded, so stored rows always have the shape the app
// reads back. Pure functions, shared by API routes and tests.

export type NewRecord = Omit<SavedRecord, 'id'> & { invoice_batch_id: string };
export type NewCustomer = Omit<CustomerProfile, 'id'>;
export type NewTruck = Omit<TruckProfile, 'id'>;
export type NewCompany = Omit<CompanyProfile, 'id'>;
export type NewClient = Omit<ClientProfile, 'id'>;
export type ProfileKind = 'customer' | 'truck' | 'company' | 'client';

export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
export const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Mirrors LOGO_VERSION in lib/server/logo-store.ts, which this may not import. */
const LOGO_VERSION = /^[a-z0-9]{8,40}$/;

type Parsed<T> = { value: T } | { error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max;
const nullableText = (value: unknown, max: number) =>
  value === null || text(value, max);
const amount = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value));
const optionalId = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
const dateOrEmpty = (value: unknown) =>
  typeof value === 'string' && (value === '' || ISO_DATE.test(value));

export function parseTicket(value: unknown): Ticket | null {
  if (!isObject(value)) return null;
  const ticket: Record<string, string | number | null> = {};
  for (const field of TEXT_FIELDS) {
    const field_value = value[field] ?? null;
    if (!nullableText(field_value, 500)) return null;
    ticket[field] = field_value as string | null;
  }
  for (const field of NUMBER_FIELDS) {
    const field_value = value[field] ?? null;
    if (!amount(field_value)) return null;
    ticket[field] = field_value as number | null;
  }
  if (ticket.rate_type !== null && !isRateType(ticket.rate_type)) return null;
  if (ticket.fuel_type !== null && !isFuelType(ticket.fuel_type)) return null;
  if (typeof ticket.hours === 'number' && ticket.hours < 0) return null;
  return ticket as Ticket;
}

export function parseInvoice(value: unknown): InvoiceDraft | null {
  if (!isObject(value) || !isObject(value.bill_to)) return null;
  const { bill_to: billTo } = value;
  const lines = billTo.address_lines;
  if (
    !text(value.invoice_number, 60) ||
    !(value.invoice_number as string).trim() ||
    !dateOrEmpty(value.invoice_date) ||
    !value.invoice_date ||
    !dateOrEmpty(value.return_date) ||
    !text(value.truck_number, 40) ||
    !text(billTo.name, 120) ||
    !Array.isArray(lines) ||
    lines.length !== 2 ||
    !lines.every((line) => text(line, 160)) ||
    !text(billTo.phone, 40)
  ) {
    return null;
  }
  return {
    invoice_number: (value.invoice_number as string).trim(),
    invoice_date: value.invoice_date as string,
    return_date: value.return_date as string,
    truck_number: value.truck_number as string,
    bill_to: {
      name: billTo.name as string,
      address_lines: [lines[0] as string, lines[1] as string],
      phone: billTo.phone as string,
    },
  };
}

export function parseSource(value: unknown): TicketSource | null {
  if (!isObject(value)) return null;
  const page = value.page;
  if (
    !text(value.file_name, 255) ||
    typeof value.sha256 !== 'string' ||
    !SHA256.test(value.sha256) ||
    !(page === undefined || (Number.isSafeInteger(page) && (page as number) >= 1 && (page as number) <= 500)) ||
    !(Number.isSafeInteger(value.size) && (value.size as number) >= 0 && (value.size as number) <= MAX_ORIGINAL_BYTES) ||
    !text(value.type, 100) ||
    (value.kind !== 'upload' && value.kind !== 'sample')
  ) {
    return null;
  }
  return {
    file_name: value.file_name as string,
    sha256: value.sha256,
    ...(page === undefined ? {} : { page: page as number }),
    size: value.size as number,
    type: value.type as string,
    kind: value.kind,
  };
}

/**
 * The recovery layer speaks in types only — nothing in recovery/contract.ts
 * runs — so the names it allows are spelled out again here. This is the edge
 * where anything at all may arrive, and a list to check a string against is
 * the whole point of the exercise.
 */
const FIELD_STATUSES = ['exact', 'recovered', 'needs_review', 'missing', 'confirmed'];
const EVIDENCE_SOURCES = [
  'visible',
  'model_proposed',
  'same_ticket',
  'vendor_rule',
  'verified_profile',
  'verified_history',
  'historical_relationship',
  'batch_context',
  'user_correction',
  'user_confirmed',
];
const REVIEW_REASONS = [
  'partial_numeric',
  'insufficient_evidence',
  'ambiguous_candidates',
  'conflicting_evidence',
  'camera_crop',
  'unsupported_proposal',
  'not_read',
];
const CLIPPED_EDGES = ['left', 'right', 'top', 'bottom'];
const EDGE_STATES = ['inside', 'cut', 'unknown'];
const PAPER_SIDES = ['left', 'right', 'top', 'bottom'] as const;
const TICKET_FIELDS = new Set<string>([...TEXT_FIELDS, ...NUMBER_FIELDS]);

/** A ticket has fewer fields than this; a `fields` map larger than it is junk. */
export const MAX_RECOVERY_FIELDS = 60;

const oneOf = (value: unknown, allowed: readonly string[]) =>
  typeof value === 'string' && allowed.includes(value);

/**
 * How a ticket's fields were read and settled, as sent, or null when any part
 * of it is not what it claims to be.
 *
 * This is the audit trail: the print that was seen, what stands, and the
 * evidence it stands on. It is stored word for word inside the record's jsonb,
 * so every string is bounded and every name is checked against a list — a
 * field the app does not have, a status it does not know or a confidence
 * outside 0 to 1 means the whole thing is refused rather than half-kept.
 */
export function parseRecovery(value: unknown): TicketRecovery | null {
  if (!isObject(value) || value.version !== 1 || !nullableText(value.vendor, 60)) return null;
  const { paper, fields } = value;
  if (!isObject(paper) || typeof paper.detected !== 'boolean') return null;
  if (!PAPER_SIDES.every((side) => oneOf(paper[side], EDGE_STATES))) return null;
  if (!isObject(fields)) return null;
  const names = Object.keys(fields);
  if (names.length > MAX_RECOVERY_FIELDS) return null;
  const resolved: Partial<Record<keyof Ticket, FieldResolution>> = {};
  for (const name of names) {
    if (!TICKET_FIELDS.has(name)) return null;
    const field = fields[name];
    if (!isObject(field)) return null;
    const { confidence, evidence, reason, candidates } = field;
    const settled = field.value;
    const confirmed = field.confirmed_by_user;
    if (
      !oneOf(field.status, FIELD_STATUSES) ||
      // As printed, or as a figure: a weight resolves to a number, a name to
      // text, and a partial reading stays the string it was on the paper.
      !(
        settled === null ||
        text(settled, 500) ||
        (typeof settled === 'number' && Number.isFinite(settled))
      ) ||
      !nullableText(field.visible_text, 500) ||
      !(field.source === null || oneOf(field.source, EVIDENCE_SOURCES)) ||
      typeof field.source_clipped !== 'boolean' ||
      !(field.clipped_edge === null || oneOf(field.clipped_edge, CLIPPED_EDGES)) ||
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      !stringList(evidence, 20, 300) ||
      !(reason === undefined || oneOf(reason, REVIEW_REASONS)) ||
      !(candidates === undefined || stringList(candidates, 10, 200)) ||
      !(confirmed === undefined || typeof confirmed === 'boolean')
    ) {
      return null;
    }
    resolved[name as keyof Ticket] = {
      status: field.status as FieldStatus,
      value: settled as string | number | null,
      visible_text: field.visible_text as string | null,
      source: field.source as EvidenceSource | null,
      source_clipped: field.source_clipped,
      clipped_edge: field.clipped_edge as ClippedEdge | null,
      confidence,
      evidence: [...(evidence as string[])],
      ...(reason === undefined ? {} : { reason: reason as ReviewReason }),
      ...(candidates === undefined ? {} : { candidates: [...(candidates as string[])] }),
      ...(confirmed === undefined ? {} : { confirmed_by_user: confirmed }),
    };
  }
  return {
    version: 1,
    vendor: value.vendor as string | null,
    paper: {
      detected: paper.detected,
      left: paper.left as EdgeState,
      right: paper.right as EdgeState,
      top: paper.top as EdgeState,
      bottom: paper.bottom as EdgeState,
    },
    fields: resolved,
  };
}

/**
 * The recovery record on a ticket being saved or changed, or an error. Absent
 * (or null, as a round trip through JSON can leave it) is not a failure: most
 * tickets were saved before any of this existed.
 */
function recoveryOf(value: unknown): Parsed<TicketRecovery | undefined> {
  if (value === undefined || value === null) return { value: undefined };
  const recovery = parseRecovery(value);
  return recovery ? { value: recovery } : { error: 'The ticket recovery details are not valid.' };
}

/** A ticket to save: its fields, invoice, source file and profile links. */
export function parseNewRecord(value: unknown): Parsed<NewRecord> {
  if (!isObject(value)) return { error: 'Expected a ticket.' };
  const ticket = parseTicket(value.ticket);
  if (!ticket) return { error: 'The ticket fields are not valid.' };
  const invoice = parseInvoice(value.invoice);
  if (!invoice) return { error: 'The invoice details are not valid.' };
  const source = parseSource(value.source);
  if (!source) return { error: 'The source file details are not valid.' };
  if (
    !text(value.saved_at, 40) ||
    Number.isNaN(Date.parse(value.saved_at as string)) ||
    typeof value.original_stored !== 'boolean' ||
    !text(value.ocr_text, 200_000) ||
    !optionalId(value.customer_profile_id) ||
    !optionalId(value.truck_id) ||
    !text(value.invoice_batch_id, 64) ||
    !(value.invoice_batch_id as string) ||
    !(value.reviewed_at === undefined ||
      value.reviewed_at === null ||
      (text(value.reviewed_at, 40) && !Number.isNaN(Date.parse(value.reviewed_at as string)))) ||
    !(value.auto_approved_at === undefined ||
      value.auto_approved_at === null ||
      (text(value.auto_approved_at, 40) && !Number.isNaN(Date.parse(value.auto_approved_at as string))))
  ) {
    return { error: 'The ticket record is not valid.' };
  }
  const recovery = recoveryOf(value.recovery);
  if ('error' in recovery) return recovery;
  const review = duplicateReviewOf(value.duplicate_review);
  if ('error' in review) return review;
  if (review.value && review.value.resolution !== 'different' && value.invoice_batch_id !== DUPLICATE_BATCH) {
    return { error: 'A suspected duplicate is held off every invoice until it is reviewed.' };
  }
  return {
    // An invoice is dated by its ticket, wherever the record came from.
    value: datedFromTicket({
      saved_at: value.saved_at as string,
      ticket,
      // Everything this function does not name is thrown away, so the audit
      // trail is carried here or it is not stored at all.
      ...(recovery.value ? { recovery: recovery.value } : {}),
      invoice,
      source,
      original_stored: value.original_stored,
      ocr_text: value.ocr_text as string,
      customer_profile_id: (value.customer_profile_id as number | null | undefined) ?? null,
      truck_id: (value.truck_id as number | null | undefined) ?? null,
      invoice_batch_id: value.invoice_batch_id as string,
      // Absent means nobody has checked it yet; see SavedRecord.reviewed_at.
      reviewed_at: (value.reviewed_at as string | null | undefined) ?? null,
      ...(typeof value.auto_approved_at === 'string' ? { auto_approved_at: value.auto_approved_at } : {}),
      ...(review.value ? { duplicate_review: review.value } : {}),
    }),
  };
}

/** The duplicate review on a ticket being saved or changed; absent is fine. */
function duplicateReviewOf(value: unknown): Parsed<DuplicateReview | undefined> {
  if (value === undefined || value === null) return { value: undefined };
  const review = parseDuplicateReview(value);
  return review ? { value: review } : { error: 'The duplicate review details are not valid.' };
}

/** Changes to a saved ticket: the fields a person can edit after saving. */
export type RecordEdit = {
  id: number;
  ticket: Ticket;
  invoice: InvoiceDraft;
  ocr_text: string;
  customer_profile_id: number | null;
  truck_id: number | null;
  /**
   * The invoice the ticket is moving to, when it is moving. A ticket belongs on
   * the invoice of its date, so correcting the date on a ticket can take it
   * off one invoice and onto another (see `invoiceMoveFor`); the batch is what
   * makes tickets one invoice here, and this is the one it joins. Absent for an
   * edit that keeps the ticket where it is, which is nearly all of them.
   */
  invoice_batch_id?: string;
  /**
   * How the ticket's fields were read and settled, when the change carries it
   * — a person accepting a recovered value in review is a change to this as
   * much as to the ticket. Absent means the edit says nothing about it, and
   * what the record already holds stands.
   */
  recovery?: TicketRecovery;
  /**
   * A change the app makes on its own — numbering an upload once every page
   * is read — rather than a person's edit. It is neither a review of the ticket
   * nor an edit in its history: `reviewed_at` and `edited_at` are left as they
   * were. Without this, numbering an upload marked every ticket in it checked,
   * and the batch read "all checked" before anyone had opened it.
   */
  bookkeeping?: true;
  /**
   * The app approving the ticket on the evidence, as part of a bookkeeping
   * edit: the mark is written, and `reviewed_at` is left as it was. Absent
   * on every other edit.
   */
  auto_approved_at?: string;
  /**
   * A step in the review of a suspected duplicate: the review as it now
   * stands. Only the steps beyond the stored ones are taken, and the side that
   * stores them stamps who and when (see `stampedReview`).
   */
  duplicate_review?: DuplicateReview;
};

export const MAX_EDITS = 200;

/** Changes to one or more saved tickets, such as every ticket on an invoice. */
export function parseRecordEdits(value: unknown): Parsed<RecordEdit[]> {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EDITS) {
    return { error: `Send between 1 and ${MAX_EDITS} ticket changes.` };
  }
  const edits: RecordEdit[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    if (!isObject(item)) return { error: 'Expected ticket changes.' };
    const { id } = item;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || seen.has(id)) {
      return { error: 'Each change needs a different saved ticket id.' };
    }
    seen.add(id);
    const ticket = parseTicket(item.ticket);
    if (!ticket) return { error: 'The ticket fields are not valid.' };
    const invoice = parseInvoice(item.invoice);
    if (!invoice) return { error: 'The invoice details are not valid.' };
    if (
      !text(item.ocr_text, 200_000) ||
      !optionalId(item.customer_profile_id) ||
      !optionalId(item.truck_id)
    ) {
      return { error: 'The ticket changes are not valid.' };
    }
    const batch = item.invoice_batch_id;
    if (batch !== undefined && !(text(batch, 64) && batch)) {
      return { error: 'The ticket changes are not valid.' };
    }
    if (item.bookkeeping !== undefined && item.bookkeeping !== true) {
      return { error: 'The ticket changes are not valid.' };
    }
    if (
      item.auto_approved_at !== undefined &&
      !(text(item.auto_approved_at, 40) && !Number.isNaN(Date.parse(item.auto_approved_at as string)))
    ) {
      return { error: 'The ticket changes are not valid.' };
    }
    const recovery = recoveryOf(item.recovery);
    if ('error' in recovery) return recovery;
    const review = duplicateReviewOf(item.duplicate_review);
    if ('error' in review) return review;
    // An invoice is dated by its ticket here too: a change that came in over
    // the API cannot leave one carrying a day of its own.
    edits.push(
      datedFromTicket({
        id,
        ticket,
        invoice,
        ocr_text: item.ocr_text as string,
        customer_profile_id: (item.customer_profile_id as number | null | undefined) ?? null,
        truck_id: (item.truck_id as number | null | undefined) ?? null,
        ...(recovery.value ? { recovery: recovery.value } : {}),
        ...(batch !== undefined ? { invoice_batch_id: batch as string } : {}),
        ...(item.bookkeeping === true ? { bookkeeping: true as const } : {}),
        ...(typeof item.auto_approved_at === 'string' ? { auto_approved_at: item.auto_approved_at } : {}),
        ...(review.value ? { duplicate_review: review.value } : {}),
      }),
    );
  }
  return { value: edits };
}

/**
 * A saved ticket with changes applied. Its source file, stored original and
 * first save time never change. Its invoice can: a ticket whose date was
 * corrected goes to the invoice of that date, and the edit says which.
 */
export function applyRecordEdit<T extends Omit<SavedRecord, 'id'>>(
  record: T,
  edit: RecordEdit,
  editedAt: string,
  /** Who is making the change, for the duplicate review's history. */
  actor: string | null = null,
): T {
  const review = stampedReview(record.duplicate_review, edit.duplicate_review, actor, editedAt);
  const applied: T = {
    ...record,
    ...(edit.invoice_batch_id ? { invoice_batch_id: edit.invoice_batch_id } : {}),
    ticket: edit.ticket,
    // An edit that says nothing about recovery leaves the record's own. A
    // rate typed on the invoice screen is not a statement about how the
    // customer's name was read, and it must not erase the trail.
    ...(edit.recovery !== undefined ? { recovery: edit.recovery } : {}),
    invoice: edit.invoice,
    ocr_text: edit.ocr_text,
    customer_profile_id: edit.customer_profile_id,
    truck_id: edit.truck_id,
    // Saving the fields after looking at them is the review — when a person
    // did the saving. The app's own bookkeeping leaves both marks alone.
    ...(edit.bookkeeping
      ? {}
      : { edited_at: editedAt, reviewed_at: editedAt }),
    ...(edit.auto_approved_at ? { auto_approved_at: edit.auto_approved_at } : {}),
    ...(review ? { duplicate_review: review } : {}),
  };
  // A suspected duplicate stays off every invoice until it is resolved as a
  // different ticket, whatever else the edit asked for: it is not to be
  // billed while nobody has looked, nor once it is found to be a repeat.
  return review && review.resolution !== 'different'
    ? {
        ...applied,
        invoice_batch_id: DUPLICATE_BATCH,
        invoice: { ...applied.invoice, invoice_number: pendingInvoiceNumber(DUPLICATE_BATCH) },
      }
    : applied;
}

const stringList = (value: unknown, maxItems: number, maxLength: number) =>
  Array.isArray(value) &&
  value.length <= maxItems &&
  value.every((item) => text(item, maxLength));

/** Stored addresses are single-spaced, and blank ones are dropped. */
const cleanAddresses = (value: unknown): string[] =>
  ((value as string[] | undefined) ?? [])
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/**
 * A site's own rate, as sent: one of the customer's addresses with the figures
 * that differ there. Cleaned against the address list by
 * `customerLocationRates` after parsing; here only the shape is checked.
 */
const isLocationRate = (value: unknown) =>
  isObject(value) &&
  text(value.address, 200) &&
  !!(value.address as string).trim() &&
  amount(value.flat_rate) &&
  !(typeof value.flat_rate === 'number' && value.flat_rate < 0) &&
  (value.rate_type === undefined || value.rate_type === null || isRateType(value.rate_type)) &&
  amount(value.fuel_charge) &&
  !(typeof value.fuel_charge === 'number' && value.fuel_charge < 0) &&
  (value.fuel_type === undefined || value.fuel_type === null || isFuelType(value.fuel_type));

const cleanLocationRates = (value: unknown): LocationRate[] =>
  ((value as Record<string, unknown>[] | undefined) ?? []).map((site) => ({
    address: (site.address as string).replace(/\s+/g, ' ').trim(),
    flat_rate: site.flat_rate as number | null,
    ...(isRateType(site.rate_type) ? { rate_type: site.rate_type } : {}),
    fuel_charge: site.fuel_charge as number | null,
    ...(isFuelType(site.fuel_type) ? { fuel_type: site.fuel_type } : {}),
  }));

export function parseCustomer(value: unknown): Parsed<NewCustomer> {
  if (
    !isObject(value) ||
    !text(value.name, 120) ||
    !(value.name as string).trim() ||
    !stringList(value.ticket_customer_ids, 20, 60) ||
    !stringList(value.ticket_names, 20, 160) ||
    // Job-site addresses are optional: profiles saved before them have none.
    !(value.addresses === undefined || stringList(value.addresses, 40, 200)) ||
    // As are rates at particular sites.
    !(
      value.location_rates === undefined ||
      (Array.isArray(value.location_rates) &&
        value.location_rates.length <= 40 &&
        value.location_rates.every(isLocationRate))
    ) ||
    !amount(value.flat_rate) ||
    !(value.rate_type === undefined || value.rate_type === null || isRateType(value.rate_type)) ||
    !(value.fuel_type === undefined || value.fuel_type === null || isFuelType(value.fuel_type)) ||
    !amount(value.fuel_charge) ||
    (typeof value.flat_rate === 'number' && value.flat_rate < 0) ||
    (typeof value.fuel_charge === 'number' && value.fuel_charge < 0) ||
    !text(value.notes, 2000) ||
    !text(value.created_at, 40)
  ) {
    return { error: 'The customer details are not valid.' };
  }
  return {
    value: {
      name: (value.name as string).trim(),
      ticket_customer_ids: value.ticket_customer_ids as string[],
      ticket_names: value.ticket_names as string[],
      addresses: cleanAddresses(value.addresses),
      location_rates: customerLocationRates({
        addresses: cleanAddresses(value.addresses),
        location_rates: cleanLocationRates(value.location_rates),
      }),
      flat_rate: value.flat_rate as number | null,
      rate_type: isRateType(value.rate_type) ? value.rate_type : 'flat',
      fuel_type: isFuelType(value.fuel_type) ? value.fuel_type : 'flat',
      fuel_charge: value.fuel_charge as number | null,
      notes: value.notes as string,
      created_at: value.created_at as string,
    },
  };
}

export function parseTruck(value: unknown): Parsed<NewTruck> {
  if (
    !isObject(value) ||
    !text(value.truck_number, 40) ||
    !(value.truck_number as string).trim() ||
    !text(value.nickname, 80) ||
    !text(value.driver, 80) ||
    !text(value.license_plate, 40) ||
    !text(value.notes, 2000) ||
    typeof value.active !== 'boolean' ||
    !text(value.created_at, 40)
  ) {
    return { error: 'The truck details are not valid.' };
  }
  return {
    value: {
      truck_number: (value.truck_number as string).trim(),
      nickname: value.nickname as string,
      driver: value.driver as string,
      license_plate: value.license_plate as string,
      notes: value.notes as string,
      active: value.active,
      created_at: value.created_at as string,
    },
  };
}

/**
 * The company on invoices: its name and a street line (both required), and a
 * city, state and ZIP line.
 */
export function parseCompany(value: unknown): Parsed<NewCompany> {
  const lines = isObject(value) ? value.address_lines : undefined;
  if (
    !isObject(value) ||
    !text(value.name, 120) ||
    !Array.isArray(lines) ||
    lines.length !== 2 ||
    !lines.every((line) => text(line, 160)) ||
    !text(value.updated_at, 40) ||
    !(value.display_name === undefined || value.display_name === null || text(value.display_name, 120)) ||
    !(
      value.default_client_id === undefined ||
      value.default_client_id === null ||
      (typeof value.default_client_id === 'number' &&
        Number.isInteger(value.default_client_id) &&
        value.default_client_id > 0)
    ) ||
    !(
      value.default_truck_id === undefined ||
      value.default_truck_id === null ||
      (typeof value.default_truck_id === 'number' &&
        Number.isInteger(value.default_truck_id) &&
        value.default_truck_id > 0)
    ) ||
    // A series start is a number with digits at the end to count from.
    !(
      value.invoice_start === undefined ||
      value.invoice_start === null ||
      (text(value.invoice_start, 60) &&
        ((value.invoice_start as string).trim() === '' || /^(.*?)(\d+)$/.test((value.invoice_start as string).trim())))
    ) ||
    // Kept as it is found, never set from here: the logo is written by the
    // route that stores the picture. Checked all the same, because anything
    // this function passes through is stored.
    !(
      value.logo_version === undefined ||
      value.logo_version === null ||
      (typeof value.logo_version === 'string' && LOGO_VERSION.test(value.logo_version))
    )
  ) {
    return { error: 'The company name and address are not valid.' };
  }
  const oneLine = (line: unknown) => (line as string).replace(/\s+/g, ' ').trim();
  const name = oneLine(value.name);
  const [street, city] = lines.map(oneLine);
  const displayName = typeof value.display_name === 'string' ? oneLine(value.display_name) : '';
  if (!name) return { error: 'Enter the company name for invoices.' };
  if (!street) return { error: 'Enter the street address for invoices.' };
  return {
    value: {
      ...(displayName ? { display_name: displayName } : {}),
      ...(typeof value.default_client_id === 'number'
        ? { default_client_id: value.default_client_id }
        : {}),
      ...(typeof value.default_truck_id === 'number'
        ? { default_truck_id: value.default_truck_id }
        : {}),
      ...(typeof value.invoice_start === 'string' && value.invoice_start.trim()
        ? { invoice_start: value.invoice_start.trim() }
        : {}),
      // Without this, saving the company name would drop the logo: everything
      // this function does not name is thrown away.
      ...(typeof value.logo_version === 'string'
        ? { logo_version: value.logo_version }
        : {}),
      name,
      address_lines: [street, city],
      updated_at: value.updated_at as string,
    },
  };
}

/** A profile to add or replace: { kind, profile }, checked for its kind. */
export function parseProfileBody(
  body: Record<string, unknown>,
): Parsed<{
  kind: ProfileKind;
  profile: NewCustomer | NewTruck | NewCompany | NewClient;
}> {
  const { kind } = body;
  if (kind !== 'customer' && kind !== 'truck' && kind !== 'company' && kind !== 'client') {
    return { error: 'Choose customer, truck, company or client.' };
  }
  const parsed =
    kind === 'customer'
      ? parseCustomer(body.profile)
      : kind === 'truck'
        ? parseTruck(body.profile)
        : kind === 'company'
          ? parseCompany(body.profile)
          : parseClient(body.profile);
  return 'error' in parsed ? parsed : { value: { kind, profile: parsed.value } };
}

/** A client billed on invoices: a name (required), two address lines and a phone. */
export function parseClient(value: unknown): Parsed<NewClient> {
  const lines = isObject(value) ? value.address_lines : undefined;
  if (
    !isObject(value) ||
    !text(value.name, 120) ||
    !Array.isArray(lines) ||
    lines.length !== 2 ||
    !lines.every((line) => text(line, 160)) ||
    !text(value.phone, 40) ||
    !text(value.notes, 2000) ||
    !text(value.created_at, 40)
  ) {
    return { error: 'The client details are not valid.' };
  }
  const oneLine = (line: unknown) => (line as string).replace(/\s+/g, ' ').trim();
  const name = oneLine(value.name);
  if (!name) return { error: 'Enter the client name.' };
  const [street, city] = lines.map(oneLine);
  return {
    value: {
      name,
      address_lines: [street, city],
      phone: oneLine(value.phone),
      notes: (value.notes as string).trim(),
      created_at: value.created_at as string,
    },
  };
}

/** Invoice numbers compare without case or surrounding spaces. */
export const invoiceKeyOf = (invoiceNumber: string) =>
  invoiceNumber.trim().toLowerCase();

/**
 * A usable ticket date for the database column, or null.
 *
 * The same reading the app files by, so the column and the batch can never
 * disagree about whether a ticket has a date: what the reader made of an
 * unreadable line stays on the ticket for a reviewer to compare against the
 * picture, and the column that reports by day holds nothing.
 */
export const ticketDateColumn = (ticket: Ticket) => ticketDay(ticket.ticket_date);

/** Positive integer id from a route segment, or null. */
export function routeId(value: string): number | null {
  if (!/^\d{1,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
