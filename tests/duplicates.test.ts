import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionProblem,
  differentTicketEdit,
  DUPLICATE_BATCH,
  DUPLICATE_INVOICE_NUMBER,
  isHeldDuplicate,
  parseDuplicateReview,
  reopenReview,
  resolveSame,
  reviewEdit,
  stampedReview,
  suspectDuplicate,
} from '../lib/load-desk/duplicates.ts';
import { applyRecordEdit, parseNewRecord, parseRecordEdits } from '../lib/load-desk/record-input.ts';
import { isPendingInvoiceNumber, numbersInDateOrder, recordBatch } from '../lib/load-desk/records.ts';
import { emptyTicket, type SavedRecord } from '../lib/load-desk/types.ts';

const AT = '2026-10-26T01:45:30.000Z';

const record = (
  id: number,
  ticketNumber: string,
  invoiceNumber: string,
  batchId: string,
  ticketDate = '2026-10-21',
): SavedRecord => ({
  id,
  saved_at: AT,
  ticket: {
    ...emptyTicket(),
    ticket_number: ticketNumber,
    ticket_date: ticketDate,
    plant_name: 'Heidelberg Materials',
    net_tons: 22.72,
  },
  recovery: {
    version: 1,
    vendor: 'heidelberg',
    paper: { detected: true, left: 'inside', right: 'inside', top: 'inside', bottom: 'inside' },
    fields: {
      ticket_number: {
        status: 'exact',
        value: ticketNumber,
        visible_text: ticketNumber,
        source: 'visible',
        source_clipped: false,
        clipped_edge: null,
        confidence: 1,
        evidence: [],
      },
    },
  },
  invoice: {
    invoice_number: invoiceNumber,
    invoice_date: ticketDate,
    return_date: '',
    truck_number: '321',
    bill_to: { name: 'K Five', address_lines: ['', ''], phone: '' },
  },
  source: {
    file_name: `ticket-${id}.jpg`,
    sha256: String(id).padStart(64, '0'),
    size: 1,
    type: 'image/jpeg',
    kind: 'upload',
  },
  original_stored: true,
  ocr_text: '',
  invoice_batch_id: batchId,
});

// Invoice 2065 as it stands: record 563 and the twelve filed beside it.
const on563 = record(563, '1725474355', '2065', 'batch-2026-10-21');
const books = [
  record(562, '1725474257', '2064', 'batch-2026-10-20', '2026-10-20'),
  on563,
  record(564, '1725475313', '2065', 'batch-2026-10-21'),
];
const held: SavedRecord = {
  ...record(576, '1725474355', DUPLICATE_INVOICE_NUMBER, DUPLICATE_BATCH),
  duplicate_review: suspectDuplicate(on563, '1725474355', AT),
};

void test('a suspected duplicate is held until it is found to be a different ticket', () => {
  assert.equal(isHeldDuplicate(held), true);
  assert.equal(isHeldDuplicate(on563), false);
  const same = { ...held, duplicate_review: resolveSame(held.duplicate_review!, AT) };
  assert.equal(isHeldDuplicate(same), true);
  const different = { ...held, duplicate_review: { ...held.duplicate_review!, resolution: 'different' as const } };
  assert.equal(isHeldDuplicate(different), false);
});

void test('held pages are not numbered and take no part in the ledger order', () => {
  const wanted = numbersInDateOrder(books.filter((one) => !isHeldDuplicate(one)));
  assert.equal(wanted.has(DUPLICATE_BATCH), false);
  assert.equal(isPendingInvoiceNumber(held.invoice.invoice_number), true);
});

void test('a different ticket is corrected and filed on the invoice of its date', () => {
  const edit = differentTicketEdit(held, '1725474385', books, AT);
  assert.equal(edit.ticket.ticket_number, '1725474385');
  assert.equal(edit.invoice_batch_id, 'batch-2026-10-21');
  assert.equal(edit.invoice.invoice_number, '2065');
  assert.equal(edit.bookkeeping, true);
  // The number is recorded as typed by a person, beside the print that was seen.
  const field = edit.recovery!.fields.ticket_number!;
  assert.equal(field.value, '1725474385');
  assert.equal(field.visible_text, '1725474355');
  assert.equal(field.confirmed_by_user, true);
  const review = edit.duplicate_review!;
  assert.equal(review.resolution, 'different');
  assert.equal(review.corrected_number, '1725474385');
  assert.deepEqual(review.history.map((step) => step.action), ['detected', 'different_ticket']);
  assert.match(review.history[1].note, /corrected from 1725474355 to 1725474385 and filed on invoice 2065/);

  const filed = applyRecordEdit(held, edit, AT, 'driver@example.com');
  assert.equal(isHeldDuplicate(filed), false);
  assert.equal(recordBatch({ ...filed, id: 576 }), 'batch-2026-10-21');
  assert.equal(filed.invoice.invoice_number, '2065');
  // Bookkeeping: the rest of the ticket still waits for its check.
  assert.equal(filed.reviewed_at, undefined);
});

void test('a different ticket on a date with no invoice opens a new one', () => {
  const later = { ...held, ticket: { ...held.ticket, ticket_date: '2026-10-22' } };
  const edit = differentTicketEdit(later, '1725480001', books, AT);
  assert.equal(edit.invoice_batch_id, 'batch-2026-10-22');
  assert.notEqual(edit.invoice.invoice_number, '2065');
  assert.notEqual(edit.invoice.invoice_number, DUPLICATE_INVOICE_NUMBER);
});

void test('a page with no date read can be given the printed date and filed on that day', () => {
  const undated = { ...held, ticket: { ...held.ticket, ticket_date: null } };
  const waits = differentTicketEdit(undated, '1725474385', books, AT);
  assert.equal(waits.invoice_batch_id, 'batch-undated');
  const edit = differentTicketEdit(undated, '1725474385', books, AT, '2026-10-21');
  assert.equal(edit.ticket.ticket_date, '2026-10-21');
  assert.equal(edit.invoice_batch_id, 'batch-2026-10-21');
  assert.equal(edit.invoice.invoice_number, '2065');
  assert.equal(edit.recovery!.fields.ticket_date!.confirmed_by_user, true);
  assert.match(edit.duplicate_review!.history.at(-1)!.note, /date entered as 2026-10-21, and filed on invoice 2065/);
  // A date read off the page is not overwritten by one typed beside it.
  assert.equal(differentTicketEdit(held, '1725474385', books, AT, '2026-10-22').ticket.ticket_date, '2026-10-21');
});

void test('the corrected number must be a different ticket that is not on file', () => {
  assert.match(correctionProblem(held, on563, '', books)!, /Enter the ticket number/);
  assert.match(correctionProblem(held, on563, '1725474355', books)!, /record 563's number/);
  assert.match(correctionProblem(held, on563, '1725475313', books)!, /already on file as record 564/);
  assert.equal(correctionProblem(held, on563, '1725474385', books), null);
});

void test('nothing a held page is edited with puts it on an invoice', () => {
  const sneaky = {
    ...reviewEdit(held, held.duplicate_review!),
    invoice: { ...held.invoice, invoice_number: '2065' },
    invoice_batch_id: 'batch-2026-10-21',
  };
  const after = applyRecordEdit(held, sneaky, AT);
  assert.equal(after.invoice_batch_id, DUPLICATE_BATCH);
  assert.equal(after.invoice.invoice_number, DUPLICATE_INVOICE_NUMBER);
});

void test('the history only grows, and the server says who and when', () => {
  const stored = stampedReview(undefined, held.duplicate_review, 'office@example.com', AT)!;
  assert.equal(stored.history[0].by, 'office@example.com');
  // A browser rewriting the past, claiming someone else, and changing what
  // was matched: the stored steps stand, the new one is stamped by the server.
  const forged = {
    ...resolveSame(stored, '1999-01-01T00:00:00.000Z'),
    suspected_of: 1,
    read_number: '1',
    history: [
      { ...stored.history[0], note: 'nothing to see', by: 'someone else' },
      { at: '1999-01-01T00:00:00.000Z', action: 'same_ticket' as const, by: 'someone else', note: 'same' },
    ],
  };
  const later = '2026-10-26T03:00:00.000Z';
  const next = stampedReview(stored, forged, 'office@example.com', later)!;
  assert.equal(next.suspected_of, 563);
  assert.equal(next.read_number, '1725474355');
  assert.deepEqual(next.history[0], stored.history[0]);
  assert.equal(next.history[1].by, 'office@example.com');
  assert.equal(next.history[1].at, later);
  assert.equal(next.resolution, 'same');
  // An edit that says nothing about the review leaves it as it is.
  assert.equal(stampedReview(stored, undefined, 'x', later), stored);
});

void test('reopening keeps every step and asks again', () => {
  const same = resolveSame(held.duplicate_review!, AT);
  const open = reopenReview(same, AT);
  assert.equal(open.resolution, null);
  assert.deepEqual(open.history.map((step) => step.action), ['detected', 'same_ticket', 'reopened']);
});

void test('the review survives the API, and a held page must be in the held batch', () => {
  const sent = JSON.parse(JSON.stringify({ ...held, id: undefined }));
  const parsed = parseNewRecord(sent);
  assert.ok('value' in parsed);
  assert.deepEqual(parsed.value.duplicate_review, held.duplicate_review);
  const onInvoice = parseNewRecord({ ...sent, invoice_batch_id: 'batch-2026-10-21' });
  assert.ok('error' in onInvoice);
  const edits = parseRecordEdits([JSON.parse(JSON.stringify(differentTicketEdit(held, '1725474385', books, AT)))]);
  assert.ok('value' in edits);
  assert.equal(edits.value[0].duplicate_review?.resolution, 'different');
  assert.equal(parseDuplicateReview({ ...held.duplicate_review, resolution: 'maybe' }), null);
  assert.equal(
    parseDuplicateReview({ ...held.duplicate_review, history: [{ at: AT, action: 'deleted', by: null, note: '' }] }),
    null,
  );
});
