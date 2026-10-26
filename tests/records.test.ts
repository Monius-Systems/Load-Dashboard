import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  invoiceGroups,
  invoiceLines,
  invoicesCsv,
  nextReviewStop,
  recordMatches,
  stepReviewStop,
  ticketStatus,
  type ReviewStop,
  sameTicketOnFile,
} from '../lib/load-desk/records.ts';
import { emptyTicket, type SavedRecord, type Ticket } from '../lib/load-desk/types.ts';

let nextId = 0;
const record = (
  invoiceNumber: string,
  ticket: Partial<Ticket>,
  invoiceDate = '2026-09-14',
): SavedRecord => ({
  id: ++nextId,
  saved_at: '2026-09-14T15:00:00.000Z',
  ticket: { ...emptyTicket(), ...ticket },
  invoice: {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    return_date: '',
    truck_number: '3211',
    bill_to: {
      name: 'ILLINOIS BULK CARRIER',
      address_lines: ['', ''],
      phone: '',
    },
  },
  source: {
    file_name: 'Trucking Loads.pdf',
    sha256: 'abc',
    size: 1,
    type: 'application/pdf',
    kind: 'upload',
  },
  original_stored: true,
  ocr_text: '',
});

const ontario = record('2271', {
  ticket_number: '5113819',
  ticket_date: '2025-04-01',
  customer_name: 'Ontario Trap Rock - US',
  net_tons: 22.39,
  rate: 175,
});
const witech = record('2271', {
  ticket_number: '1725172271',
  ticket_date: '2025-01-07',
  customer_name: 'WITECH COMPANY INC',
  project_address: '31480 EDISON RD, NEW CARLISLE, IN 46552 US',
  net_lb: 45820,
  rate: 150,
  fuel_charge: 20,
});
const draft = record(
  'draft-1725193636',
  { ticket_number: '1725193636', ticket_date: '2025-04-01', net_tons: 22.84 },
  '2026-09-15',
);

void test('tickets with one invoice number form one invoice in print order', () => {
  const groups = invoiceGroups([ontario, witech, draft]);
  assert.deepEqual(
    groups.map((group) => group.invoice.invoice_number),
    ['draft-1725193636', '2271'],
    'newest invoice date first',
  );
  const combined = groups[1];
  assert.deepEqual(
    combined.records.map((r) => r.ticket.ticket_number),
    ['1725172271', '5113819'],
  );
  assert.equal(combined.tons, 45.3);
  assert.equal(combined.total, 345);
  assert.equal(combined.needsRate, false);
  assert.equal(combined.firstTicketDate, '2025-01-07');
  assert.equal(combined.lastTicketDate, '2025-04-01');
  assert.equal(groups[0].needsRate, true);
  assert.equal(groups[0].total, 0);
});

void test('invoice lookup ignores case and surrounding spaces', () => {
  assert.equal(invoiceLines([ontario, witech, draft], ' DRAFT-1725193636 ').length, 1);
  assert.equal(invoiceLines([ontario, witech, draft], '2271').length, 2);
});

void test('search matches every word across ticket, invoice and destination', () => {
  assert.equal(recordMatches(witech, 'witech carlisle'), true);
  assert.equal(recordMatches(witech, '2271 3211'), true);
  assert.equal(recordMatches(witech, 'witech chicago'), false);
  assert.equal(recordMatches(witech, '  '), true);
});

void test('ticket status follows validation', () => {
  assert.equal(ticketStatus(draft), 'needs_review');
});

void test('invoice CSV has one row per invoice', () => {
  const lines = invoicesCsv(invoiceGroups([ontario, witech])).split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^invoice_number,invoice_date,/);
  assert.match(lines[1], /^2271,2026-09-14,,3211,ILLINOIS BULK CARRIER,2,1725172271; 5113819,/);
  assert.match(lines[1], /,45\.3,345,rated,false$/);
});

/**
 * A review, written as the invoices it runs through: each invoice a run of
 * tickets, `r` for one already checked and `.` for one still waiting. Every
 * invoice is dated a day later than the one before it, in the order given.
 *
 *   review(['.r.', '..'])  →  invoice A: 3 tickets, the middle one checked
 *                             invoice B: 2 tickets, both waiting
 */
const review = (invoices: string[]): ReviewStop[] =>
  invoices.flatMap((tickets, invoice) =>
    Array.from(tickets, (mark) => ({
      invoice: `invoice-${invoice}`,
      day: Date.UTC(2026, 0, 1 + invoice),
      reviewed: mark === 'r',
    })),
  );

void test('reviewing runs through the invoice it is on before any other', () => {
  // One invoice of three: straight down it, and only then is it done with.
  const stops = review(['...']);
  assert.equal(nextReviewStop(stops, 0), 1);
  assert.equal(nextReviewStop(review(['r..']), 1), 2);
});

void test('a finished invoice hands on to the next one with work on it', () => {
  // Two tickets on the first invoice, three on the second. Finishing the second
  // ticket finishes the invoice, so the review opens the next invoice's first.
  const stops = review(['rr', '...']);
  assert.equal(nextReviewStop(stops, 1), 2, 'the first ticket of invoice B');
  assert.equal(nextReviewStop(review(['rr', 'r..']), 1), 3, 'its first one waiting');
});

void test('an invoice already finished is stepped over', () => {
  // Invoice A is done, B is done, C is not: the review does not stop at B.
  const stops = review(['rr', 'rr', '..']);
  assert.equal(nextReviewStop(stops, 1), 4);
});

void test('a ticket skipped earlier on the invoice is come back to', () => {
  // Checked out of order by hand: the first is still waiting when the last is
  // finished, and the invoice is not left half done.
  const stops = review(['.rr', '..']);
  assert.equal(nextReviewStop(stops, 2), 0, 'back to the one skipped');
});

void test('an invoice skipped earlier is come back to before the review ends', () => {
  // The last invoice is finished but the first was never started. Nothing after
  // it is waiting, so the review turns back rather than calling itself done.
  const stops = review(['..', 'rr', 'rr']);
  assert.equal(nextReviewStop(stops, 5), 0);
});

void test('the review ends only when every invoice of it is finished', () => {
  assert.equal(nextReviewStop(review(['rr', 'r', 'rrr']), 0), -1);
  assert.equal(nextReviewStop(review(['r']), 0), -1, 'one invoice of one ticket');
  assert.equal(nextReviewStop(review([]), 0), -1, 'nothing to review');
  // Work left anywhere at all keeps it going.
  assert.notEqual(nextReviewStop(review(['rr', 'r.', 'rrr']), 0), -1);
});

void test('every ticket of every invoice is offered exactly once', () => {
  // Three invoices of 3, 1 and 2. Each pass checks the ticket it was handed;
  // the walk ends only once all six have been seen, each of them once, and it
  // never leaves an invoice with work still on it.
  for (const start of [0, 3, 5]) {
    const stops = review(['...', '.', '..']);
    const seen: number[] = [];
    let at = start;
    while (at >= 0) {
      assert.equal(stops[at].reviewed, false, `ticket ${at} was offered twice`);
      stops[at] = { ...stops[at], reviewed: true };
      seen.push(at);
      // An invoice is never left part-finished behind the review.
      const left = stops.findIndex((stop, index) => !stop.reviewed && index < at);
      at = nextReviewStop(stops, at);
      if (at > left && left >= 0 && stops[left].invoice === stops[at]?.invoice) {
        assert.fail('left a ticket behind on the invoice being reviewed');
      }
    }
    assert.equal(seen.length, 6, `started at ${start}`);
  }
});

void test('the arrows step through the invoice being reviewed', () => {
  const stops = review(['...', '..']);
  assert.equal(stepReviewStop(stops, 0, 1), 1);
  assert.equal(stepReviewStop(stops, 1, 1), 2);
  assert.equal(stepReviewStop(stops, 2, -1), 1);
  assert.equal(stepReviewStop(stops, 0, -1), null, 'nowhere before the first');
});

void test('an arrow at the end of an invoice carries on to the next', () => {
  // Pressed at the far end rather than stopping dead, and back goes wherever
  // forward came from, so crossing over is never one-way.
  const stops = review(['rr', '..']);
  assert.equal(stepReviewStop(stops, 1, 1), 2, 'on to the next invoice');
  assert.equal(stepReviewStop(stops, 2, -1), 1, 'and back to the one before');
  assert.equal(
    stepReviewStop(review(['rr', 'rr']), 1, 1),
    null,
    'nothing waiting anywhere, so forward stops',
  );
});

void test('invoices are worked through oldest first, whatever order they queued in', () => {
  // The order the numbers were handed out in: an invoice is dated by its
  // tickets, and the numbering runs by that date.
  const stops: ReviewStop[] = [
    { invoice: 'january', day: Date.UTC(2026, 0, 6), reviewed: true },
    { invoice: 'december', day: Date.UTC(2025, 11, 19), reviewed: false },
  ];
  // Finishing the January ticket turns back to the older December invoice.
  assert.equal(nextReviewStop(stops, 0), 1);
  // And an undated invoice has no place in a run of days, so it comes last.
  const undated: ReviewStop[] = [
    { invoice: 'undated', day: null, reviewed: true },
    { invoice: 'dated', day: Date.UTC(2026, 0, 6), reviewed: false },
  ];
  assert.equal(nextReviewStop(undated, 0), 1);
});

void test('a second photograph of a ticket already on file is the same ticket', () => {
  const onFile = {
    id: 42,
    saved_at: '2026-09-14T15:00:00.000Z',
    ticket: { ...emptyTicket(), ticket_number: '1725331394', plant_name: 'Heidelberg Materials' },
    invoice: { invoice_number: '7', invoice_date: '2026-09-14', return_date: '', truck_number: '', bill_to: { name: '', address_lines: ['', ''], phone: '' } },
    source: { file_name: 'a.jpg', sha256: 'a'.repeat(64), size: 1, type: 'image/jpeg', kind: 'upload' as const },
    original_stored: true,
    ocr_text: '',
  } satisfies SavedRecord;
  assert.equal(sameTicketOnFile([onFile], { ticket_number: '1725331394', plant_name: 'Heidelberg Materials' })?.id, 42);
  assert.equal(sameTicketOnFile([onFile], { ticket_number: 'BOL 1725331394', plant_name: null })?.id, 42, 'digits are what count; no plant named is no disagreement');
  assert.equal(sameTicketOnFile([onFile], { ticket_number: '1725331394', plant_name: 'Ontario Trap Rock' }), null, 'another plant’s number is another ticket');
  assert.equal(sameTicketOnFile([onFile], { ticket_number: '1725331395', plant_name: 'Heidelberg Materials' }), null);
  assert.equal(sameTicketOnFile([onFile], { ticket_number: '12345', plant_name: 'Heidelberg Materials' }), null, 'too short to be sure of');
});

void test('the same plant read two ways is the same plant', () => {
  const onFile = record('2027', {
    ticket_number: '4836297',
    plant_name: 'NORTHFIELD Aggregates',
    plant_code: 'N12',
  });
  // Seen on staging: the second photograph read the plant as "NORTHFIELD",
  // and the repeat was filed beside the first, billed twice.
  assert.equal(sameTicketOnFile([onFile], { ticket_number: '4836297', plant_name: 'NORTHFIELD' })?.id, onFile.id);
  assert.equal(sameTicketOnFile([onFile], { ticket_number: '4836297', plant_name: 'Northfield Aggregates Inc.' })?.id, onFile.id);
  assert.equal(
    sameTicketOnFile([onFile], { ticket_number: '4836297', plant_name: 'NRTHFLD YARD', plant_code: 'N12' })?.id,
    onFile.id,
    'the plant code printed on both settles it when the name was read badly',
  );
  assert.equal(
    sameTicketOnFile([onFile], { ticket_number: '4836297', plant_name: 'Aggregates' })?.id,
    onFile.id,
    'a name with nothing distinctive in it is no disagreement',
  );
  assert.equal(
    sameTicketOnFile([onFile], { ticket_number: '4836297', plant_name: 'Ozinga Ready Mix', plant_code: 'K3' }),
    null,
    'another plant, by name and by code, is another ticket',
  );
});
