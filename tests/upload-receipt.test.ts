import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameTicketOnFile, UNDATED_BATCH, pendingInvoiceNumber } from '../lib/load-desk/records.ts';
import {
  receiptCounts,
  receiptLines,
  type ReceiptEntry,
  type UploadReceipt,
} from '../lib/load-desk/upload-receipt.ts';
import { emptyTicket, type SavedRecord } from '../lib/load-desk/types.ts';
import {
  DUPLICATE_BATCH,
  DUPLICATE_INVOICE_NUMBER,
  resolveSame,
  suspectDuplicate,
} from '../lib/load-desk/duplicates.ts';

const record = (
  id: number,
  ticketNumber: string,
  invoiceNumber: string,
  batchId: string,
): SavedRecord => ({
  id,
  saved_at: '2026-10-26T01:40:00.000Z',
  ticket: {
    ...emptyTicket(),
    ticket_number: ticketNumber,
    ticket_date: '2026-10-21',
    plant_name: 'Heidelberg Materials',
  },
  invoice: {
    invoice_number: invoiceNumber,
    invoice_date: '2026-10-21',
    return_date: '',
    truck_number: '321',
    bill_to: { name: '', address_lines: ['', ''], phone: '' },
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

// The upload of 25 October: ticket 1725474355 was filed on its own as record
// 563, on invoice 2065, and then the day's stack of thirteen was photographed.
// Twelve were filed beside it; the thirteenth was read as 1725474355 again.
// It used to be turned away unsaved; it is now kept as record 576, held off
// every invoice until somebody compares it with record 563.
const BATCH = 'batch-2026-10-21';
const NUMBERS = [
  '1725475313', '1725475237', '1725475175', '1725475076', '1725475001', '1725474936',
  '1725474864', '1725474791', '1725474701', '1725474634', '1725474559', '1725474457',
];
const on563 = record(563, '1725474355', '2065', BATCH);
const filed = NUMBERS.map((number, index) => record(564 + index, number, '2065', BATCH));
const records = [on563, ...filed];
const held576: SavedRecord = {
  ...record(576, '1725474355', DUPLICATE_INVOICE_NUMBER, DUPLICATE_BATCH),
  duplicate_review: suspectDuplicate(on563, '1725474355', '2026-10-26T01:45:30.000Z'),
};

const stack: ReceiptEntry[] = [
  ...filed.map((saved): ReceiptEntry => ({
    file: saved.source.file_name,
    ticketNumber: saved.ticket.ticket_number,
    kind: 'saved',
    recordId: saved.id,
    detail: null,
  })),
  {
    file: 'ticket-1792978779000.jpg',
    ticketNumber: '1725474355',
    kind: 'held',
    recordId: 576,
    matchedId: 563,
    detail: null,
  },
];
const receipt: UploadReceipt = { at: '2026-10-26T01:45:31.000Z', entries: stack, opened: [] };

void test('the thirteenth sheet of the stack is kept as record 576, held on no invoice', () => {
  const again = sameTicketOnFile(records, {
    ticket_number: '1725474355',
    plant_name: 'Heidelberg Materials',
  });
  assert.equal(again?.id, 563);
  const lines = receiptLines(receipt, [...records, held576]);
  assert.equal(lines.length, 13);
  const last = lines.at(-1)!;
  assert.equal(last.outcome, 'suspected');
  assert.equal(last.recordId, 576);
  assert.equal(last.matchedId, 563);
  assert.equal(last.invoice, null);
});

void test('once compared, the held page reads as what it was found to be', () => {
  const same = { ...held576, duplicate_review: resolveSame(held576.duplicate_review!, '2026-10-26T02:00:00.000Z') };
  const sameLine = receiptLines(receipt, [...records, same]).at(-1)!;
  assert.equal(sameLine.outcome, 'duplicate');
  // Billed where that ticket is billed: on record 563's invoice, once.
  assert.equal(sameLine.invoice, '2065');
  const filedNow: SavedRecord = {
    ...held576,
    ticket: { ...held576.ticket, ticket_number: '1725474385' },
    invoice: { ...held576.invoice, invoice_number: '2065' },
    invoice_batch_id: BATCH,
    duplicate_review: { ...held576.duplicate_review!, resolution: 'different', corrected_number: '1725474385' },
  };
  const filedLine = receiptLines(receipt, [...records, filedNow]).at(-1)!;
  assert.equal(filedLine.outcome, 'filed');
  assert.equal(filedLine.ticketNumber, '1725474385');
  assert.equal(filedLine.invoice, '2065');
});

void test('every page is counted once, and joining an invoice on file is not creating one', () => {
  const counts = receiptCounts(receiptLines(receipt, [...records, held576]));
  assert.equal(counts.saved, 12);
  assert.deepEqual(counts.suspected, [576]);
  assert.deepEqual(counts.created, []);
  assert.deepEqual(counts.joined, ['2065']);
  assert.equal(
    counts.saved +
      counts.suspected.length +
      counts.duplicates.length +
      counts.sameFile.length +
      counts.unsaved +
      counts.failed +
      counts.gone,
    stack.length,
  );
});

void test('an invoice the upload opened is new; its number is read off the records as they stand', () => {
  const opened = 'batch-2026-10-22';
  const pending = record(600, '1725480001', pendingInvoiceNumber(opened), opened);
  const own: UploadReceipt = {
    at: '',
    entries: [{ file: 'a.jpg', ticketNumber: '1725480001', kind: 'saved', recordId: 600, detail: null }],
    opened: [opened],
  };
  // Still waiting for its number: on no invoice yet, rather than on the mark.
  assert.equal(receiptLines(own, [pending])[0].invoice, null);
  // Numbered since: the receipt follows the record, not what it was handed.
  const numbered = { ...pending, invoice: { ...pending.invoice, invoice_number: '2066' } };
  const [line] = receiptLines(own, [numbered]);
  assert.equal(line.invoice, '2066');
  assert.equal(line.newInvoice, true);
  assert.deepEqual(receiptCounts([line]).created, ['2066']);
});

void test('pages on no invoice say so: undated, unread, unsaved and deleted since', () => {
  const undated = record(700, '1725490001', pendingInvoiceNumber(UNDATED_BATCH), UNDATED_BATCH);
  const lines = receiptLines(
    {
      at: '',
      opened: [UNDATED_BATCH],
      entries: [
        { file: 'u.jpg', ticketNumber: null, kind: 'saved', recordId: 700, detail: null },
        { file: 'blank.pdf', ticketNumber: null, kind: 'failed', recordId: null, detail: 'the file is empty' },
        { file: 'yard.jpg', ticketNumber: '1725490002', kind: 'unsaved', recordId: null, detail: 'offline' },
        { file: 'gone.jpg', ticketNumber: '1725490003', kind: 'saved', recordId: 999, detail: null },
      ],
    },
    [undated],
  );
  assert.deepEqual(
    lines.map((line) => [line.outcome, line.invoice]),
    [
      ['undated', null],
      ['failed', null],
      ['unsaved', null],
      ['gone', null],
    ],
  );
  const counts = receiptCounts(lines);
  assert.equal(counts.saved, 1);
  assert.equal(counts.undated, 1);
  assert.deepEqual(counts.created, []);
  assert.equal(counts.saved + counts.failed + counts.unsaved + counts.gone, 4);
});
