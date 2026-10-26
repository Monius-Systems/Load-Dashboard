import { watchForChanges } from './live.ts';
import { apiJson, dataMode, type DataMode } from './data-mode';
import { datedFromTicket, staleInvoiceDates } from './invoice-dates';
import { applyRecordEdit, type RecordEdit } from './record-input';
import {
  findInvoiceClash,
  invoicePlacement,
  isPendingInvoiceNumber,
  numbersInDateOrder,
  pendingInvoiceNumber,
  recordBatch,
  strandedDated,
} from './records';
import { ticketDay } from './ticket-date.ts';
import { isHeldDuplicate } from './duplicates.ts';
import { getProfilesSnapshot } from './profiles.ts';
import type { SavedRecord } from './types';

// Saved tickets. Signed-in members read and write the workspace database
// through /api/records, with scans in private storage via /api/originals.
// The unprotected local preview keeps records in localStorage and scans in
// IndexedDB instead; it is never available in a production build.

export type RecordsSnapshot = {
  /**
   * The tickets of the books: everything but the suspected duplicates held
   * for review (see duplicates.ts). Every invoice, total, chart and number is
   * worked out from these, so a held page cannot reach any of them.
   */
  records: SavedRecord[];
  /** Suspected duplicates: waiting for review, or found to be repeats. */
  held: SavedRecord[];
  error: string | null;
  ready: boolean;
  mode: DataMode | null;
};

/** A ticket to save; the id and whether the scan was stored come back. */
export type RecordDraft = Omit<SavedRecord, 'id' | 'original_stored'> & {
  invoice_batch_id: string;
};

const RECORDS_KEY = 'monius-demo.load-desk.records.v1';
const SERVER_SNAPSHOT: RecordsSnapshot = {
  records: [],
  held: [],
  error: null,
  ready: false,
  mode: null,
};

let snapshot: RecordsSnapshot = SERVER_SNAPSHOT;
let loading = false;
const listeners = new Set<() => void>();

/**
 * Publishes the records. `next.records` is every record, held or not; they
 * are sorted into the books and the held ones here, the one place records
 * come in, so nothing reading the store has to remember to leave them out.
 */
function publish(next: Omit<RecordsSnapshot, 'held'>) {
  snapshot = {
    ...next,
    records: next.records.filter((record) => !isHeldDuplicate(record)),
    held: next.records.filter(isHeldDuplicate),
  };
  for (const listener of listeners) listener();
}

/** Every record, held or not: what is stored, as the store writes it. */
const everything = () => [...snapshot.records, ...snapshot.held];

function isSavedRecord(value: unknown): value is SavedRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SavedRecord>;
  return (
    typeof record.id === 'number' &&
    typeof record.ticket === 'object' &&
    record.ticket !== null &&
    typeof record.invoice?.invoice_number === 'string' &&
    typeof record.invoice?.bill_to === 'object' &&
    typeof record.source?.sha256 === 'string'
  );
}

function readLocalRecords(): Omit<RecordsSnapshot, 'held'> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(RECORDS_KEY);
  } catch {
    return {
      records: [],
      error: 'Browser storage is unavailable, so tickets cannot be saved here.',
      ready: true,
      mode: 'local',
    };
  }
  if (!raw) return { records: [], error: null, ready: true, mode: 'local' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isSavedRecord)) {
      return { records: parsed, error: null, ready: true, mode: 'local' };
    }
  } catch {
    // Reported below; stored data is never silently overwritten.
  }
  return {
    records: [],
    error: 'Saved tickets in this browser could not be read and were left untouched.',
    ready: true,
    mode: 'local',
  };
}

/** Every record dated the one way, whatever is stored (see staleInvoiceDates). */
const dated = (records: SavedRecord[]) => {
  const repaired = staleInvoiceDates(records);
  if (!repaired.length) return records;
  const byId = new Map(repaired.map((record) => [record.id, record]));
  return records.map((record) => byId.get(record.id) ?? record);
};

/**
 * Local records, with invoices dated from their tickets where an older one was
 * filed with the day it was photographed (see staleInvoiceDates). Written back
 * as records rather than as edits, so nothing is marked checked or edited by
 * the repair; later reads find nothing to repair.
 */
function readRepairedLocalRecords(): Omit<RecordsSnapshot, 'held'> {
  const read = readLocalRecords();
  const repaired = read.error ? [] : staleInvoiceDates(read.records);
  if (!repaired.length) return read;
  const byId = new Map(repaired.map((record) => [record.id, record]));
  const records = read.records.map((record) => byId.get(record.id) ?? record);
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Shown repaired anyway; the repair is tried again on the next load.
  }
  return { ...read, records };
}

async function load() {
  const mode = await dataMode();
  if (mode === 'local') {
    publish(readRepairedLocalRecords());
    return;
  }
  if (mode === 'unavailable') {
    publish({
      records: [],
      error: 'Your session has ended. Sign in again to see saved tickets.',
      ready: true,
      mode,
    });
    return;
  }
  const result = await apiJson<{ records: SavedRecord[] }>('/api/records');
  // The same repair for the workspace database, but in what is handed to the
  // pages rather than written back: saving is what marks a ticket checked, and
  // a ticket filed to be looked at later must not be marked checked by a date
  // being put right. The row itself is corrected the next time it is saved —
  // by then it is going through the parsers, which date it from its ticket.
  publish(
    result.ok
      ? { records: dated(result.data.records), error: null, ready: true, mode }
      : { records: [], error: result.error, ready: true, mode },
  );
}

/** One catch-up at a time; a slow answer must not stack up behind itself. */
let reloading = false;
async function reload() {
  if (reloading || snapshot.mode === 'local') return;
  reloading = true;
  try {
    await load();
  } finally {
    reloading = false;
  }
}

export function subscribeRecords(listener: () => void) {
  listeners.add(listener);
  if (!loading) {
    loading = true;
    void load();
  }
  // A ticket saved on a phone shows up here without anyone reloading.
  const stopWatching = watchForChanges(() => void reload());
  const onStorage = (event: StorageEvent) => {
    if (snapshot.mode !== 'local') return;
    if (event.key !== RECORDS_KEY && event.key !== null) return;
    publish(readRepairedLocalRecords());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    stopWatching();
    window.removeEventListener('storage', onStorage);
  };
}

export const getRecordsSnapshot = () => snapshot;
export const getServerRecordsSnapshot = () => SERVER_SNAPSHOT;

function writeLocalRecords(records: SavedRecord[]): string | null {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    return 'Could not write to browser storage. Nothing was changed.';
  }
  publish({ records, error: null, ready: true, mode: 'local' });
  return null;
}

/** Local preview only: discards unreadable saved tickets in this browser. */
export function clearLocalRecords() {
  if (snapshot.mode === 'local') writeLocalRecords([]);
}

const UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
  'text/plain',
]);
const uploadType = (type: string) => {
  const normalized = type === 'image/jpg' ? 'image/jpeg' : type;
  return UPLOAD_TYPES.has(normalized) ? normalized : 'application/octet-stream';
};

/**
 * Saves a ticket with its scan. On the server the scan is stored first, then
 * the record; the database refuses a duplicate page or an invoice number
 * already used by another upload.
 */
export async function saveRecord(
  requested: RecordDraft,
  original: Blob,
): Promise<{ record: SavedRecord } | { error: string }> {
  // Dated by its ticket before it is stored, whoever sent it and whichever
  // side stores it. The parsers do the same for anything arriving over the API.
  const draft = datedFromTicket(requested);
  const mode = snapshot.mode ?? (await dataMode());
  if (mode === 'remote') {
    const upload = await apiJson<{ ok: true }>(
      `/api/originals/${draft.source.sha256}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': uploadType(draft.source.type) },
        body: original,
      },
    );
    if (!upload.ok) return { error: upload.error };
    const result = await apiJson<{ record: SavedRecord }>('/api/records', {
      method: 'POST',
      body: JSON.stringify({ record: { ...draft, original_stored: true } }),
    });
    if (!result.ok) return { error: result.error };
    publish({ ...snapshot, records: [result.data.record, ...everything()] });
    return { record: result.data.record };
  }
  if (mode !== 'local') return { error: 'Your session has ended. Sign in again to save.' };
  if (snapshot.error) return { error: snapshot.error };
  let originalStored = true;
  try {
    await putOriginal(draft.source.sha256, original);
  } catch {
    originalStored = false;
  }
  const record: SavedRecord = {
    ...draft,
    original_stored: originalStored,
    id: everything().reduce((max, item) => Math.max(max, item.id), 0) + 1,
  };
  const error = writeLocalRecords([record, ...everything()]);
  return error ? { error } : { record };
}

/**
 * Saves changes to saved tickets, all together (every ticket on an invoice
 * when its details change). Returns the updated records or an error message.
 */
export async function updateSavedRecords(
  requested: RecordEdit[],
): Promise<{ records: SavedRecord[] } | { error: string }> {
  if (!requested.length) return { records: [] };
  // Whichever page sent the change, the invoice is dated from its ticket. The
  // parsers enforce it too, for a change that comes in over the API.
  const edits = requested.map(datedFromTicket);
  const replaced = (updated: SavedRecord[]) => {
    const byId = new Map(updated.map((record) => [record.id, record]));
    return everything().map((record) => byId.get(record.id) ?? record);
  };
  if (snapshot.mode === 'remote') {
    const result = await apiJson<{ records: SavedRecord[] }>('/api/records', {
      method: 'PATCH',
      body: JSON.stringify({ edits }),
    });
    if (!result.ok) return { error: result.error };
    publish({ ...snapshot, records: replaced(result.data.records) });
    return { records: result.data.records };
  }
  if (snapshot.mode !== 'local') return { error: 'Your session has ended. Sign in again to save.' };
  if (snapshot.error) return { error: snapshot.error };
  const editedAt = new Date().toISOString();
  const updated: SavedRecord[] = [];
  for (const edit of edits) {
    const record = everything().find((item) => item.id === edit.id);
    if (!record) {
      return { error: 'A ticket you changed no longer exists. Reload and try again.' };
    }
    // Older tickets get their upload recorded, so a new invoice number stays
    // theirs. A ticket moving to another invoice brings that one with it.
    const withBatch = {
      ...record,
      invoice_batch_id: edit.invoice_batch_id ?? recordBatch(record),
    };
    // Nobody to name in the local preview.
    updated.push({ ...applyRecordEdit(withBatch, edit, editedAt, null), id: edit.id });
  }
  const clash = findInvoiceClash(
    everything(),
    updated.map((record) => ({
      id: record.id,
      invoiceNumber: record.invoice.invoice_number,
      batchId: recordBatch(record),
    })),
  );
  if (clash) {
    return { error: `Invoice number ${clash} is already used by another upload. Choose another.` };
  }
  const error = writeLocalRecords(replaced(updated));
  return error ? { error } : { records: updated };
}

/**
 * The ledger read in date order (see `numbersInDateOrder`): where the numbers
 * on file do not follow the dates, or leave a gap, they are moved so that
 * they do. Returns the records that changed.
 *
 * Here in the store rather than on a page, because the things that put a
 * ledger out of order happen on more than one page: an upload of older
 * tickets on Load Desk, a deletion on Invoices & Tickets. It used to run only
 * on Load Desk, and deleting invoice 2 on the Invoices page left invoice 3
 * where it was until Load Desk was next opened.
 *
 * In two writes, because a number is claimed by one batch at a time and two
 * batches swapping numbers in one go would each be refused the other's: first
 * every batch that is moving is put on a draft mark of its own, which
 * releases its number; then each takes the number the date order gives it.
 * Never run twice at once; a caller that finds it running gets nothing back
 * and the run already going does the work.
 */
let reordering = false;
export async function reorderInvoicesByDate(): Promise<SavedRecord[]> {
  if (reordering || !snapshot.ready) return [];
  const stranded = strandedDated(snapshot.records);
  const wanted = numbersInDateOrder(snapshot.records, getProfilesSnapshot().company?.invoice_start);
  if (!wanted.size && !stranded.length) return [];
  reordering = true;
  try {
    // First, tickets that have a date and are still on the undated batch go
    // onto their date's invoice — a group answer used to date them and
    // leave them there. Their numbers are then part of the run below.
    if (stranded.length) {
      const moved: SavedRecord[] = [];
      for (const record of stranded) {
        const placed = invoicePlacement(record, ticketDay(record.ticket.ticket_date)!, snapshot.records);
        if (!placed.batchId) continue;
        const result = await updateSavedRecords([
          {
            id: record.id,
            ticket: record.ticket,
            invoice: placed.invoice,
            ocr_text: record.ocr_text,
            customer_profile_id: record.customer_profile_id ?? null,
            truck_id: record.truck_id ?? null,
            ...(record.recovery ? { recovery: record.recovery } : {}),
            invoice_batch_id: placed.batchId,
            bookkeeping: true,
          },
        ]);
        if ('error' in result) return moved;
        moved.push(...result.records);
      }
      // Numbered from the ledger as it is now, on the next pass.
      const rest = numbersInDateOrder(snapshot.records, getProfilesSnapshot().company?.invoice_start);
      if (!rest.size) return moved;
      reordering = false;
      return [...moved, ...(await reorderInvoicesByDate())];
    }
    const edit = (record: SavedRecord, number: string): RecordEdit => ({
      id: record.id,
      ticket: record.ticket,
      invoice: { ...record.invoice, invoice_number: number },
      ocr_text: record.ocr_text,
      customer_profile_id: record.customer_profile_id ?? null,
      truck_id: record.truck_id ?? null,
      ...(record.recovery ? { recovery: record.recovery } : {}),
      bookkeeping: true,
    });
    const moving = snapshot.records.filter((record) => {
      const number = wanted.get(recordBatch(record));
      return number !== undefined && number !== record.invoice.invoice_number;
    });
    const parked = moving
      .filter((record) => !isPendingInvoiceNumber(record.invoice.invoice_number))
      .map((record) => edit(record, pendingInvoiceNumber(`reorder-${recordBatch(record)}`)));
    if (parked.length) {
      const result = await updateSavedRecords(parked);
      if ('error' in result) return [];
    }
    const placed = moving.map((record) => edit(record, wanted.get(recordBatch(record))!));
    const result = await updateSavedRecords(placed);
    return 'error' in result ? [] : result.records;
  } finally {
    reordering = false;
  }
}

/**
 * Deletes a saved ticket, and its scan unless another saved ticket (another
 * page of the same PDF) still uses it. Returns an error message.
 */
export async function deleteSavedRecord(
  records: SavedRecord[],
  record: SavedRecord,
): Promise<string | null> {
  if (snapshot.mode === 'remote') {
    const result = await apiJson<{ ok: true }>(`/api/records/${record.id}`, {
      method: 'DELETE',
    });
    // Already gone elsewhere: drop it here too.
    if (!result.ok && result.status !== 404) return result.error;
    publish({
      ...snapshot,
      records: everything().filter((item) => item.id !== record.id),
    });
    // The gap the deletion may have left is closed now, from wherever the
    // deletion was made.
    void reorderInvoicesByDate();
    return null;
  }
  if (snapshot.mode !== 'local') return 'Your session has ended. Sign in again.';
  // Written from everything stored, not the list the page passed: a page
  // sees only the books, and writing that back would drop the held pages.
  const stored = everything();
  const error = writeLocalRecords(stored.filter((item) => item.id !== record.id));
  if (error) return error;
  void reorderInvoicesByDate();
  const shared = [...records, ...stored].some(
    (other) => other.id !== record.id && other.source.sha256 === record.source.sha256,
  );
  if (!shared) {
    try {
      await deleteOriginal(record.source.sha256);
    } catch {
      // The record is gone; an orphaned blob is unreachable and harmless.
    }
  }
  return null;
}

/** A saved ticket's stored original, or null when it is not stored or unreachable. */
export async function loadStoredOriginal(record: SavedRecord): Promise<Blob | null> {
  try {
    if (snapshot.mode === 'remote') {
      const response = await fetch(`/api/originals/${record.source.sha256}`, {
        cache: 'no-store',
      });
      if (response.status === 401) window.location.assign('/login');
      return response.ok ? await response.blob() : null;
    }
    return record.original_stored ? await getOriginal(record.source.sha256) : null;
  } catch {
    return null;
  }
}

/**
 * Opens a saved ticket's original in a new tab. Call it directly from a click
 * handler: the tab opens before any await, so pop-up blockers allow it.
 * Throws an Error with a user-facing message when it cannot.
 */
export async function openStoredOriginal(record: SavedRecord) {
  const opened = window.open('', '_blank');
  try {
    if (!opened) throw new Error('Allow pop-ups to open the original.');
    const blob = await loadStoredOriginal(record);
    if (!blob) throw new Error('The original is not stored for this ticket.');
    const url = URL.createObjectURL(blob);
    opened.location.href =
      url + (record.source.page ? `#page=${record.source.page}` : '');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    opened?.close();
    throw error;
  }
}

// Local preview scans, keyed by SHA-256 in IndexedDB.
const DB_NAME = 'monius-demo-load-desk';
const ORIGINALS = 'originals';

function openOriginals(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot store original files.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(ORIGINALS);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open original storage.'));
  });
}

async function withOriginals<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openOriginals();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(ORIGINALS, mode);
      const request = run(transaction.objectStore(ORIGINALS));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Original storage failed.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Original storage was aborted.'));
    });
  } finally {
    db.close();
  }
}

async function putOriginal(sha256: string, blob: Blob) {
  await withOriginals('readwrite', (store) => store.put(blob, sha256));
}

async function getOriginal(sha256: string): Promise<Blob | null> {
  const found = await withOriginals(
    'readonly',
    (store) => store.get(sha256) as IDBRequest<Blob | undefined>,
  );
  return found ?? null;
}

async function deleteOriginal(sha256: string) {
  await withOriginals('readwrite', (store) => store.delete(sha256));
}
