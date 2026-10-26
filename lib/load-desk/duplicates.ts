// Tickets that may be a second photograph of one already on file.
//
// A plant's ticket number is the ticket, so a number already on file used to
// mean the page was a repeat: it was turned away unsaved, its photograph went
// with it, and nobody could ever check. But a number is read off a picture,
// and a different ticket whose number was read wrong looks exactly like a
// repeat. So a suspected repeat is now kept like any other page — the
// photograph stored, the record saved — and held out of the books in a batch
// of its own until a person has put the two pictures side by side and said.
//
// "Same ticket" keeps it held for good: preserved, never billed. "Different
// ticket" takes the corrected number and puts it on the invoice of its date.
// Every step is written into the record's own history, which only ever grows:
// the server appends what is new, stamped with who did it and when, and keeps
// what was there.

import { confirmField } from './recovery/resolve.ts';
import type { RecordEdit } from './record-input.ts';
import type { Resemblance } from './resemblance.ts';
import {
  DUPLICATE_BATCH,
  invoicePlacement,
  pendingInvoiceNumber,
  sameTicketOnFile,
  UNDATED_BATCH,
} from './records.ts';
import { ticketDay } from './ticket-date.ts';
import type { SavedRecord } from './types.ts';

export { DUPLICATE_BATCH, isDuplicateBatch } from './records.ts';
/** The mark a held page carries where an invoice number would be. */
export const DUPLICATE_INVOICE_NUMBER = pendingInvoiceNumber(DUPLICATE_BATCH);

export const DUPLICATE_ACTIONS = ['detected', 'same_ticket', 'different_ticket', 'reopened'] as const;
export type DuplicateAction = (typeof DUPLICATE_ACTIONS)[number];

/** One step in a suspected repeat's history. */
export type DuplicateAuditEntry = {
  at: string;
  action: DuplicateAction;
  /** Who, as the server knows them; null in the local preview. */
  by: string | null;
  note: string;
};

export type DuplicateReview = {
  /** The record this page was taken for a second photograph of. */
  suspected_of: number;
  /** The ticket number as read off this page. */
  read_number: string;
  /**
   * Why it was held: `number`, its number is that record's; `resemblance`,
   * its number came out different but the rest of the paper is that record's
   * (resemblance.ts). Absent on pages held before resemblance existed, which
   * were all held for their number.
   */
  match?: 'number' | 'resemblance';
  /** What the two tickets agree on, for a page held for a resemblance. */
  reasons?: string[];
  /** null while waiting for a person; then what they said. */
  resolution: 'same' | 'different' | null;
  /** The number a person corrected it to, on "Different ticket". */
  corrected_number: string | null;
  history: DuplicateAuditEntry[];
};

/**
 * Held out of the books: waiting to be looked at, or looked at and found to
 * be the same ticket. A different ticket is an ordinary ticket again.
 */
export const isHeldDuplicate = (record: Pick<SavedRecord, 'duplicate_review'>) =>
  !!record.duplicate_review && record.duplicate_review.resolution !== 'different';

export const awaitsDuplicateReview = (record: Pick<SavedRecord, 'duplicate_review'>) =>
  record.duplicate_review?.resolution === null;

const entry = (action: DuplicateAction, note: string, at: string): DuplicateAuditEntry => ({
  at,
  action,
  by: null,
  note,
});

/**
 * The review a page starts with when its number matches `matched`'s — or,
 * given `resemblance`, when its number came out different and the rest of the
 * paper is that ticket's.
 */
export function suspectDuplicate(
  matched: SavedRecord,
  readNumber: string,
  at: string,
  resemblance: Resemblance | null = null,
): DuplicateReview {
  const note = resemblance
    ? `Looks like record ${matched.id} though its number was read as ${readNumber || 'nothing'}. ${resemblance.reasons.join(' ')} Held for review, on no invoice.`
    : `Ticket number read as ${readNumber}, the number of record ${matched.id}. Held for review, on no invoice.`;
  return {
    suspected_of: matched.id,
    read_number: readNumber,
    match: resemblance ? 'resemblance' : 'number',
    ...(resemblance ? { reasons: resemblance.reasons.map((reason) => reason.slice(0, MAX_REASON)) } : {}),
    resolution: null,
    corrected_number: null,
    history: [entry('detected', note.slice(0, MAX_NOTE), at)],
  };
}

const MAX_NOTE = 500;
const MAX_REASON = 300;

export function resolveSame(review: DuplicateReview, at: string): DuplicateReview {
  return {
    ...review,
    resolution: 'same',
    history: [
      ...review.history,
      entry('same_ticket', `Confirmed the same ticket as record ${review.suspected_of}. Kept, never billed.`, at),
    ],
  };
}

export function reopenReview(review: DuplicateReview, at: string): DuplicateReview {
  return {
    ...review,
    resolution: null,
    history: [...review.history, entry('reopened', 'Reopened for review.', at)],
  };
}

const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

/**
 * Why `number` cannot be the corrected ticket number, or null when it can.
 * It has to be a number, it has to differ from the one it was mistaken for,
 * and it must not be a ticket already on file — that would be the same
 * mistake with another record.
 */
export function correctionProblem(
  record: SavedRecord,
  matched: SavedRecord | undefined,
  number: string,
  billable: SavedRecord[],
): string | null {
  const typed = digits(number);
  if (!typed) return 'Enter the ticket number printed on this page.';
  if (matched && typed === digits(matched.ticket.ticket_number)) {
    return `That is record ${matched.id}'s number. If the page shows it too, it is the same ticket.`;
  }
  const taken = sameTicketOnFile(
    billable.filter((other) => other.id !== record.id),
    { ticket_number: typed, plant_name: record.ticket.plant_name, plant_code: record.ticket.plant_code },
  );
  return taken ? `Ticket ${typed} is already on file as record ${taken.id}.` : null;
}

/**
 * The edit that files a suspected repeat as the different ticket it is: its
 * number corrected and recorded as typed by a person, onto the invoice of its
 * date — the one that date's tickets are on, or a new one — and the review
 * closed. Bookkeeping, so the rest of the ticket still waits for its check
 * like any other; the person settled the number, not the rates.
 */
export function differentTicketEdit(
  record: SavedRecord,
  correctedNumber: string,
  billable: SavedRecord[],
  at: string,
  /**
   * The date printed on the page, when none was read off it (YYYY-MM-DD).
   * Without it a page with no date goes on to "Date not found" to wait for
   * one; with it, it goes straight onto that day's invoice.
   */
  enteredDate: string | null = null,
): RecordEdit {
  const review = record.duplicate_review!;
  const number = correctedNumber.trim();
  const dated = !ticketDay(record.ticket.ticket_date) && ticketDay(enteredDate) ? enteredDate : null;
  const ticket = {
    ...record.ticket,
    ticket_number: number,
    ...(dated ? { ticket_date: dated } : {}),
  };
  const day = ticketDay(ticket.ticket_date);
  const recovery = record.recovery
    ? dated
      ? confirmField(confirmField(record.recovery, 'ticket_number', number, 'edited'), 'ticket_date', dated, 'edited')
      : confirmField(record.recovery, 'ticket_number', number, 'edited')
    : undefined;
  const placed = day
    ? invoicePlacement({ ...record, ticket }, day, billable)
    : {
        // No day read off it either: from one holding batch to the other,
        // where it waits for its date like any undated ticket.
        invoice: { ...record.invoice, invoice_number: pendingInvoiceNumber(UNDATED_BATCH) },
        batchId: UNDATED_BATCH,
      };
  return {
    id: record.id,
    ticket,
    ...(recovery ? { recovery } : {}),
    invoice: placed.invoice,
    ocr_text: record.ocr_text,
    customer_profile_id: record.customer_profile_id ?? null,
    truck_id: record.truck_id ?? null,
    ...(placed.batchId ? { invoice_batch_id: placed.batchId } : {}),
    bookkeeping: true,
    duplicate_review: {
      ...review,
      resolution: 'different',
      corrected_number: number,
      history: [
        ...review.history,
        entry(
          'different_ticket',
          `A different ticket from record ${review.suspected_of}. Ticket number corrected from ${review.read_number} to ${number}${
            dated ? `, date entered as ${dated},` : ''
          }${
            placed.invoice.invoice_number && !/^draft-/i.test(placed.invoice.invoice_number)
              ? ` and filed on invoice ${placed.invoice.invoice_number}`
              : day
                ? ' and filed on its date'
                : ' and left in “Date not found” for its date'
          }.`,
          at,
        ),
      ],
    },
  };
}

/** The edit for a review that changes nothing else on the ticket. */
export function reviewEdit(record: SavedRecord, review: DuplicateReview): RecordEdit {
  return {
    id: record.id,
    ticket: record.ticket,
    ...(record.recovery ? { recovery: record.recovery } : {}),
    invoice: record.invoice,
    ocr_text: record.ocr_text,
    customer_profile_id: record.customer_profile_id ?? null,
    truck_id: record.truck_id ?? null,
    bookkeeping: true,
    duplicate_review: review,
  };
}

/**
 * The review as it is to be stored, given what is stored already.
 *
 * Append-only: what is on file stays as it is, word for word, and only the
 * entries beyond it are taken — stamped with `by` and `at` here, on the side
 * that knows who is asking, rather than with whatever the browser said. What
 * the page was mistaken for and the number it was read as are facts of the
 * first save and never change.
 */
export function stampedReview(
  stored: DuplicateReview | undefined,
  incoming: DuplicateReview | undefined,
  by: string | null,
  at: string,
): DuplicateReview | undefined {
  if (!incoming) return stored;
  const kept = stored?.history ?? [];
  const added = incoming.history.slice(kept.length).map((step) => ({ ...step, at, by }));
  return {
    ...incoming,
    suspected_of: stored?.suspected_of ?? incoming.suspected_of,
    read_number: stored?.read_number ?? incoming.read_number,
    ...(stored ? { match: stored.match, reasons: stored.reasons } : {}),
    history: [...kept, ...added],
  };
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

export const MAX_DUPLICATE_HISTORY = 100;

/** A review as sent, or null when it is not one. */
export function parseDuplicateReview(value: unknown): DuplicateReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const review = value as Record<string, unknown>;
  const id = review.suspected_of;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
  if (!isText(review.read_number, 40)) return null;
  if (!(review.resolution === null || review.resolution === 'same' || review.resolution === 'different')) {
    return null;
  }
  const corrected = review.corrected_number ?? null;
  if (!(corrected === null || isText(corrected, 40))) return null;
  const match = review.match;
  if (!(match === undefined || match === 'number' || match === 'resemblance')) return null;
  const reasons = review.reasons;
  if (
    !(reasons === undefined ||
      (Array.isArray(reasons) && reasons.length <= 6 && reasons.every((reason) => isText(reason, MAX_REASON))))
  ) {
    return null;
  }
  if (!Array.isArray(review.history) || review.history.length > MAX_DUPLICATE_HISTORY) return null;
  const history: DuplicateAuditEntry[] = [];
  for (const step of review.history) {
    if (!step || typeof step !== 'object') return null;
    const { at, action, by, note } = step as Record<string, unknown>;
    if (!isText(at, 40) || Number.isNaN(Date.parse(at))) return null;
    if (!(DUPLICATE_ACTIONS as readonly unknown[]).includes(action)) return null;
    if (!(by === null || by === undefined || isText(by, 200))) return null;
    if (!isText(note, MAX_NOTE)) return null;
    history.push({ at, action: action as DuplicateAction, by: (by as string | null | undefined) ?? null, note });
  }
  return {
    suspected_of: id,
    read_number: review.read_number,
    ...(match ? { match } : {}),
    ...(reasons ? { reasons: reasons as string[] } : {}),
    resolution: review.resolution,
    corrected_number: corrected,
    history,
  };
}
