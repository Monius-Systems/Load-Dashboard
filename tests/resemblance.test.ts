import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differentLoad, numberSlip, resemblingTicketOnFile } from '../lib/load-desk/resemblance.ts';
import {
  correctionProblem,
  DUPLICATE_BATCH,
  DUPLICATE_INVOICE_NUMBER,
  parseDuplicateReview,
  stampedReview,
  suspectDuplicate,
} from '../lib/load-desk/duplicates.ts';
import { sameTicketOnFile } from '../lib/load-desk/records.ts';
import { emptyTicket, type SavedRecord, type Ticket } from '../lib/load-desk/types.ts';

const AT = '2026-10-26T01:45:30.000Z';
let nextId = 600;
const ticket = (fields: Partial<Ticket>): Ticket => ({
  ...emptyTicket(),
  plant_name: 'Heidelberg Materials',
  plant_code: 'U857',
  ticket_date: '2026-10-21',
  vehicle_id: 'ZF0321',
  order_number: '6100307876',
  customer_name: 'K FIVE CONSTRUCTION',
  product_code: '56001224',
  tare_lb: 27140,
  ...fields,
});
const onFile = (fields: Partial<Ticket>): SavedRecord => ({
  id: ++nextId,
  saved_at: AT,
  ticket: ticket(fields),
  invoice: {
    invoice_number: '2065',
    invoice_date: '2026-10-21',
    return_date: '',
    truck_number: '321',
    bill_to: { name: 'Z-FORCE', address_lines: ['', ''], phone: '' },
  },
  source: { file_name: `t-${nextId}.jpg`, sha256: String(nextId).padStart(64, '0'), size: 1, type: 'image/jpeg', kind: 'upload' },
  original_stored: true,
  ocr_text: '',
  invoice_batch_id: 'batch-2026-10-21',
});
const load = (number: string, gross: number, extra: Partial<Ticket> = {}) => ({
  ticket_number: number,
  gross_lb: gross,
  net_lb: gross - 27140,
  net_tons: (gross - 27140) / 2000,
  ...extra,
});

// Ticket 1725474355 as it is on invoice 2065.
const t4355 = onFile(load('1725474355', 72580));

void test('a number one slip of the reader away is told apart from a different number', () => {
  assert.equal(numberSlip('17254743555', '1725474355'), 'digit_added');
  assert.equal(numberSlip('172547435', '1725474355'), 'digit_dropped');
  assert.equal(numberSlip('1725474385', '1725474355'), 'digit_changed');
  assert.equal(numberSlip('1725474535', '1725474355'), 'digits_swapped');
  assert.equal(numberSlip('1725474355', '1725474355'), null, 'the same number is the exact check’s');
  assert.equal(numberSlip('1725474457', '1725474355'), null, 'the next load at the plant is two digits off');
  assert.equal(numberSlip('1725475345', '1725474355'), null, 'two digits swapped that are not neighbours is not one slip');
  assert.equal(numberSlip('17254743', '1725474355'), null, 'two digits missing is not one slip');
});

void test('OCR digit insertion: the reader adds a digit to a ticket already on file', () => {
  // On staging the model read every printed 4810001 as 48100001.
  const found = resemblingTicketOnFile([t4355], ticket(load('17254743550', 72580)));
  assert.equal(found?.record.id, t4355.id);
  assert.equal(found?.slip, 'digit_added');
  assert.match(found!.reasons[0], /1725474355 with a digit added/);
  assert.match(found!.reasons[1], /gross 72580 lb/);
  assert.equal(sameTicketOnFile([t4355], ticket(load('17254743550', 72580))), null, 'the exact check alone misses it');
});

void test('missing digit: the reader drops one', () => {
  // Two A&D tickets are on file with nine digits, read short this way.
  const found = resemblingTicketOnFile([t4355], ticket(load('172547435', 72580)));
  assert.equal(found?.slip, 'digit_dropped');
  assert.equal(found?.record.id, t4355.id);
});

void test('transposed digits: two neighbours read the wrong way round', () => {
  const found = resemblingTicketOnFile([t4355], ticket(load('1725474535', 72580)));
  assert.equal(found?.slip, 'digits_swapped');
});

void test('one digit read wrong is held when the weights agree, and filed when they do not', () => {
  assert.equal(resemblingTicketOnFile([t4355], ticket(load('1725474385', 72580)))?.slip, 'digit_changed');
  assert.equal(
    resemblingTicketOnFile([t4355], ticket(load('1725474385', 73100))),
    null,
    'gross and net both different: another load whose number is one digit off',
  );
  assert.equal(
    resemblingTicketOnFile([t4355], ticket({ ...load('1725474385', 72580), net_lb: 45400, gross_lb: 72600 })),
    null,
  );
  // One weight misread as well is still the same paper: only both apart parts them.
  assert.equal(
    resemblingTicketOnFile([t4355], ticket({ ...load('1725474385', 72580), gross_lb: 72880 }))?.record.id,
    t4355.id,
  );
});

void test('plant-name variations do not hide a repeat, and another plant is another ticket', () => {
  const northfield = onFile({ ...load('4836297', 73100), plant_name: 'NORTHFIELD Aggregates', plant_code: 'N12' });
  const reread = (plant: Partial<Ticket>) =>
    resemblingTicketOnFile([northfield], ticket({ ...load('48362970', 73100), plant_code: null, ...plant }));
  assert.equal(reread({ plant_name: 'NORTHFIELD' })?.record.id, northfield.id);
  assert.equal(reread({ plant_name: 'Northfield Aggregates Inc.' })?.record.id, northfield.id);
  assert.equal(reread({ plant_name: 'NRTHFLD', plant_code: 'N12' })?.record.id, northfield.id, 'the plant code settles it');
  assert.equal(reread({ plant_name: null })?.record.id, northfield.id, 'no plant read is no disagreement');
  assert.equal(reread({ plant_name: 'Ozinga Ready Mix', plant_code: 'K3' }), null);
  assert.equal(differentLoad(ticket({ plant_name: 'Ozinga Ready Mix', plant_code: 'K3' }), northfield.ticket), 'another plant');
});

void test('repeated loads with the same weights, same truck and same day are filed normally', () => {
  // The A&D books hold twenty-one such pairs; tickets 545 and 546 of Oct 19
  // weighed 73140 / 45900 lb both, numbers 1725472943 and 1725473026.
  const first = onFile(load('1725472943', 73140, { ticket_date: '2026-10-19' }));
  const second = ticket(load('1725473026', 73140, { ticket_date: '2026-10-19' }));
  assert.equal(resemblingTicketOnFile([first], second), null);
  // Similar weights, sequential numbers: the next loads of the day.
  assert.equal(resemblingTicketOnFile([first], ticket(load('1725473101', 73160, { ticket_date: '2026-10-19' }))), null);
  assert.equal(resemblingTicketOnFile([first], ticket(load('1725472987', 73120, { ticket_date: '2026-10-19' }))), null);
});

void test('a whole day of one truck on one job replays with nothing held', () => {
  // Thirteen loads in the shape of Oct 21: numbers 60–120 apart, three of
  // them weighing exactly what another did.
  const grosses = [72580, 72140, 72320, 73100, 73220, 72860, 72700, 72920, 73100, 72620, 73280, 72580, 72820];
  let number = 1725480355;
  const day: SavedRecord[] = [];
  for (const [index, gross] of grosses.entries()) {
    const next = ticket(load(String(number), gross));
    assert.equal(sameTicketOnFile(day, next), null);
    assert.equal(resemblingTicketOnFile(day, next), null, `load ${index + 1} (${number}) is filed`);
    day.push(onFile(load(String(number), gross)));
    number += 60 + ((index * 37) % 61);
  }
  // And a second photograph of any of them, read a digit long, is held.
  const fourth = day[3];
  const again = ticket(load(`${fourth.ticket.ticket_number}0`, fourth.ticket.gross_lb!));
  assert.equal(resemblingTicketOnFile(day, again)?.record.id, fourth.id);
});

void test('anything the paper clearly disagrees on makes two loads, whatever the number', () => {
  const near = (extra: Partial<Ticket>) => ticket({ ...load('17254743550', 72580), ...extra });
  assert.equal(resemblingTicketOnFile([t4355], near({ ticket_date: '2026-10-22' })), null, 'another day');
  assert.equal(resemblingTicketOnFile([t4355], near({ vehicle_id: 'ZF0455' })), null, 'another truck');
  assert.equal(resemblingTicketOnFile([t4355], near({ order_number: '6100999111' })), null, 'another order');
  const timed = onFile(load('1725490111', 72580, { time_out: '07:57' }));
  assert.equal(resemblingTicketOnFile([timed], ticket(load('17254901110', 72580, { time_out: '09:48' }))), null, 'another time out');
  // A truck or a date read one character off is not a disagreement.
  assert.equal(resemblingTicketOnFile([t4355], near({ vehicle_id: 'ZF032I' }))?.record.id, t4355.id);
  assert.equal(resemblingTicketOnFile([t4355], near({ ticket_date: null }))?.record.id, t4355.id);
});

void test('a number far off is held only when something only one load can have agrees', () => {
  const timed = onFile(load('4836297', 73100, { time_in: '07:40', time_out: '07:57', today_loads: 7 }));
  // The number read badly in two places, but the times and the day's count
  // are that load's.
  const found = resemblingTicketOnFile([timed], ticket(load('4886217', 73100, { time_in: '7:40', time_out: '07:57', today_loads: 7 })));
  assert.equal(found?.record.id, timed.id);
  assert.equal(found?.slip, null);
  assert.match(found!.reasons[0], /not 4836297, but everything else agrees/);
  // Weights alone, with no time or count on the paper, are not enough.
  assert.equal(resemblingTicketOnFile([t4355], ticket(load('1725479999', 72580))), null);
  // No number read: held on a time that agrees, not on weights alone.
  assert.equal(resemblingTicketOnFile([timed], ticket(load('', 73100, { time_out: '07:57' })))?.record.id, timed.id);
  assert.equal(resemblingTicketOnFile([t4355], ticket(load('', 72580))), null);
});

void test('a resemblance is held with its reasons, and they stay as first recorded', () => {
  const found = resemblingTicketOnFile([t4355], ticket(load('17254743550', 72580)))!;
  const review = suspectDuplicate(t4355, '17254743550', AT, found);
  assert.equal(review.match, 'resemblance');
  assert.deepEqual(review.reasons, found.reasons);
  assert.match(review.history[0].note, /^Looks like record \d+ though its number was read as 17254743550\./);
  assert.deepEqual(parseDuplicateReview(JSON.parse(JSON.stringify(review))), review);
  const stored = stampedReview(undefined, review, 'office@example.com', AT)!;
  const rewritten = stampedReview(stored, { ...stored, match: 'number', reasons: ['nothing'] }, 'x', AT)!;
  assert.equal(rewritten.match, 'resemblance');
  assert.deepEqual(rewritten.reasons, found.reasons);
  assert.equal(parseDuplicateReview({ ...review, match: 'guess' }), null);
});

void test('filing a resembling page as a different ticket may keep the number it was read with', () => {
  const held: SavedRecord = {
    ...onFile(load('1725474385', 72580)),
    invoice: { ...t4355.invoice, invoice_number: DUPLICATE_INVOICE_NUMBER },
    invoice_batch_id: DUPLICATE_BATCH,
  };
  assert.equal(correctionProblem(held, t4355, '1725474385', [t4355]), null, 'the number as read is not on file');
  assert.match(correctionProblem(held, t4355, '1725474355', [t4355])!, /record \d+'s number/);
});
