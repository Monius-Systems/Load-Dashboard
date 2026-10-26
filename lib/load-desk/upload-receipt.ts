// What became of every page of one upload, a line each.
//
// The count under the upload button used to be the whole account of a scan:
// "13 processed · 2 invoices created". A page refused as a second photograph
// of a ticket already on file was counted among the processed and given an
// invoice number of its own in the tab — an invoice that was never saved and
// that nobody could find afterwards. A stack of thirteen came back as twelve
// tickets on one invoice, one ticket unexplained and one invoice that did not
// exist. The receipt names, for each page, the record it is and the invoice
// that record is on, or why it is on none — and for a page held as a possible
// duplicate, the record it matched and what has been decided about it since.
//
// What the upload decided is kept (which record each page became, or matched);
// the invoice is looked up on the records as they stand whenever it is shown,
// because numbers move into date order after the upload is in and a receipt
// that kept the number it was handed would be wrong by the next upload.

import { isPendingInvoiceNumber, isUndatedBatch, recordBatch } from './records.ts';
import type { SavedRecord } from './types.ts';
import type { Translator } from '../i18n/translate.ts';

/** What the upload did with one page, decided as it happened. */
export type ReceiptEntry = {
  /** The file as it was chosen, with its page for a document of several. */
  file: string;
  /** As read off the page; the saved record's number is preferred when shown. */
  ticketNumber: string | null;
  /**
   * `saved`: filed now as `recordId`. `held`: saved as `recordId`, but its
   * ticket number is `matchedId`'s, so it is held off every invoice for a
   * side-by-side check. `same_file`: this very file is stored already, as
   * `recordId`. `unsaved`: read, but the save failed and it waits in the
   * queue. `failed`: nothing could be read and the file is back with the
   * files waiting.
   */
  kind: 'saved' | 'held' | 'same_file' | 'unsaved' | 'failed';
  recordId: number | null;
  /** The record a held page's ticket number matched. */
  matchedId?: number | null;
  /** Why a page is on no record: the reader's or the server's words. */
  detail: string | null;
};

export type UploadReceipt = {
  /** When the upload finished. */
  at: string;
  entries: ReceiptEntry[];
  /** The batches this upload opened. An invoice of one of them is new. */
  opened: string[];
};

/**
 * Where one page is now. `filed` and `undated` are records saved by this
 * upload, on an invoice or waiting for a date — a held page found to be a
 * different ticket among them. `suspected` is held, waiting for its check;
 * `duplicate` was checked and is the same ticket as the one it matched, kept
 * and never billed. `same_file` is a file stored before; `gone` a record
 * since deleted.
 */
export type ReceiptOutcome =
  | 'filed'
  | 'undated'
  | 'suspected'
  | 'duplicate'
  | 'same_file'
  | 'unsaved'
  | 'failed'
  | 'gone';

export type ReceiptLine = {
  file: string;
  ticketNumber: string | null;
  outcome: ReceiptOutcome;
  recordId: number | null;
  /** The record a held page matched, or null. */
  matchedId: number | null;
  /** The invoice number the record is on now, or null for none yet. */
  invoice: string | null;
  /** That invoice was opened by this upload, not one already on file. */
  newInvoice: boolean;
  detail: string | null;
};

/**
 * The receipt against the records as they stand — the books and the held
 * pages together. One line per entry, in order.
 */
export function receiptLines(receipt: UploadReceipt, records: SavedRecord[]): ReceiptLine[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const opened = new Set(receipt.opened);
  return receipt.entries.map((entry) => {
    const record = entry.recordId === null ? undefined : byId.get(entry.recordId);
    const base = {
      file: entry.file,
      ticketNumber: record?.ticket.ticket_number ?? entry.ticketNumber,
      recordId: entry.recordId,
      matchedId: entry.matchedId ?? null,
      invoice: null,
      newInvoice: false,
      detail: entry.detail,
    };
    if (entry.kind === 'failed' || entry.kind === 'unsaved') {
      return { ...base, outcome: entry.kind };
    }
    if (!record) return { ...base, outcome: 'gone' };
    const batch = recordBatch(record);
    const number = record.invoice.invoice_number.trim();
    const invoice =
      isUndatedBatch(batch) || !number || isPendingInvoiceNumber(number) ? null : number;
    if (entry.kind === 'same_file') return { ...base, outcome: 'same_file', invoice };
    const review = record.duplicate_review;
    if (review && review.resolution !== 'different') {
      // Held, on no invoice. Once found to be the same ticket, the invoice
      // shown is the matched record's, which is where that ticket is billed.
      const matched = byId.get(review.suspected_of);
      const theirs = matched?.invoice.invoice_number.trim() ?? '';
      return {
        ...base,
        matchedId: review.suspected_of,
        outcome: review.resolution === 'same' ? 'duplicate' : 'suspected',
        invoice:
          review.resolution === 'same' && theirs && !isPendingInvoiceNumber(theirs) ? theirs : null,
      };
    }
    return {
      ...base,
      outcome: isUndatedBatch(batch) ? 'undated' : 'filed',
      invoice,
      newInvoice: invoice !== null && opened.has(batch),
    };
  });
}

export type ReceiptCounts = {
  /** Saved by this upload: on an invoice, or waiting for a date. */
  saved: number;
  undated: number;
  /** Held for a side-by-side check, by the record each is. */
  suspected: number[];
  /** Checked and found to be the same ticket, by the record each matched. */
  duplicates: number[];
  /** Files stored before, by the record each already is. */
  sameFile: number[];
  unsaved: number;
  failed: number;
  gone: number;
  /** Invoices this upload opened, and invoices on file it added tickets to. */
  created: string[];
  joined: string[];
};

/**
 * The lines added up. Every line is counted exactly once among saved,
 * suspected, duplicates, sameFile, unsaved, failed and gone, so the parts
 * always add up to the pages of the upload.
 */
export function receiptCounts(lines: ReceiptLine[]): ReceiptCounts {
  const created = new Set<string>();
  const joined = new Set<string>();
  const counts: ReceiptCounts = {
    saved: 0,
    undated: 0,
    suspected: [],
    duplicates: [],
    sameFile: [],
    unsaved: 0,
    failed: 0,
    gone: 0,
    created: [],
    joined: [],
  };
  for (const line of lines) {
    if (line.outcome === 'filed' || line.outcome === 'undated') {
      counts.saved++;
      if (line.outcome === 'undated') counts.undated++;
      if (line.invoice !== null) (line.newInvoice ? created : joined).add(line.invoice);
    } else if (line.outcome === 'suspected') {
      counts.suspected.push(line.recordId!);
    } else if (line.outcome === 'duplicate') {
      counts.duplicates.push(line.matchedId!);
    } else if (line.outcome === 'same_file') {
      counts.sameFile.push(line.recordId!);
    } else {
      counts[line.outcome]++;
    }
  }
  counts.created = [...created];
  // An invoice opened by this upload is not also one it joined.
  counts.joined = [...joined].filter((number) => !created.has(number));
  return counts;
}

/**
 * What the last upload came to, as the line under the upload button says it:
 * worked out from the receipt against the records as they stand whenever it
 * is shown, not frozen as the upload finished. A page held as a possible
 * duplicate reads as held until somebody compares it, and as filed — on the
 * invoice it went to — or as the same ticket once they have.
 */
export function receiptTally(
  lines: ReceiptLine[],
  { t, plural }: Pick<Translator, 't' | 'plural'>,
): string[] {
  const counts = receiptCounts(lines);
  const records = (ids: number[]) => ids.map((id) => t('record {id}', { id })).join(', ');
  const suspected = lines.filter((line) => line.outcome === 'suspected');
  return [
    counts.saved ? t('✓ {tickets} filed', { tickets: plural(counts.saved, 'ticket') }) : '',
    counts.created.length
      ? t('✓ {invoices} created ({numbers})', {
          invoices: plural(counts.created.length, 'invoice'),
          numbers: counts.created.join(', '),
        })
      : '',
    counts.joined.length
      ? t('added to {invoices} on file ({numbers})', {
          invoices: plural(counts.joined.length, 'invoice'),
          numbers: counts.joined.join(', '),
        })
      : '',
    suspected.length
      ? t('{tickets} held as possible duplicates ({records}), on no invoice until you compare them', {
          tickets: plural(suspected.length, 'ticket'),
          records: suspected.map((line) => t('matches record {id}', { id: line.matchedId! })).join(', '),
        })
      : '',
    counts.duplicates.length
      ? t('{tickets} checked as the same ticket as {records}, not billed', {
          tickets: plural(counts.duplicates.length, 'ticket'),
          records: records(counts.duplicates),
        })
      : '',
    counts.sameFile.length
      ? t('{files} already saved ({records})', {
          files: plural(counts.sameFile.length, 'file'),
          records: records(counts.sameFile),
        })
      : '',
    counts.gone ? t('{tickets} deleted since', { tickets: plural(counts.gone, 'ticket') }) : '',
  ].filter(Boolean);
}
