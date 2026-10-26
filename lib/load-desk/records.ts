import { normalizeName } from './customer-rates.ts';
import { csvCell, lineTotal } from './format.ts';
import { unresolvedCritical } from './recovery/index.ts';
import { ticketDateValue, ticketDay } from './ticket-date.ts';
import { validateTicket } from './validate.ts';
import type { InvoiceDraft, SavedRecord, Ticket } from './types.ts';

export { isUnreadableDate, ticketDateValue, ticketDay } from './ticket-date.ts';

// Invoices are not stored separately: saved tickets that carry the same
// invoice number are the lines of one invoice.

export const invoiceKey = (invoiceNumber: string) =>
  invoiceNumber.trim().toLowerCase();

/** Print order on an invoice: ticket date, then the order saved. */
export const byTicketDate = (a: SavedRecord, b: SavedRecord) =>
  (a.ticket.ticket_date ?? '').localeCompare(b.ticket.ticket_date ?? '') ||
  a.id - b.id;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Oldest day first. A ticket with no day to place goes after every dated one. */
const byDay = (a: number | null, b: number | null) => {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a - b;
};

export const recordTons = (record: SavedRecord) =>
  record.ticket.net_tons ??
  (record.ticket.net_lb === null ? 0 : record.ticket.net_lb / 2000);

/**
 * Splits an upload into one invoice per ticket date, oldest date first.
 *
 * A ticket whose date was not read is held apart in a group of its own, with a
 * null date, after every dated one. It used to be given the date of the ticket
 * before it, on the theory that it was the second page of that ticket — and
 * then billed on that day's invoice, at that day's number, without anyone
 * being told the date had been guessed. A ticket with no date is a ticket that
 * is not ready to invoice; it waits for the date to be read off the paper.
 *
 * A date the scan made a mess of — a day the calendar has not got, a month
 * past twelve — joins them there rather than opening a group of its own. It
 * is no more a day to bill than a blank is, and a group it cannot be ordered
 * by is a group nothing can number: one of those sat on a draft mark
 * indefinitely, looking like an invoice that was merely late.
 *
 * Grouping is by the day a date names, not the text it is written in, so the
 * same day written two ways is one group and one invoice.
 */
export function groupByTicketDate<T>(
  items: T[],
  dateOf: (item: T) => string | null,
): { date: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const date = ticketDay(dateOf(item));
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return [...groups]
    .map(([date, grouped], arrived) => ({ date, items: grouped, arrived }))
    .sort(
      (a, b) =>
        byDay(ticketDateValue(a.date), ticketDateValue(b.date)) ||
        a.arrived - b.arrived,
    )
    .map(({ date, items }) => ({ date, items }));
}

/** The most recently saved record of a batch; id settles a tie within a second. */
const lastSavedIn = (items: SavedRecord[]) =>
  items.reduce((latest, item) =>
    item.saved_at > latest.saved_at ||
    (item.saved_at === latest.saved_at && item.id > latest.id)
      ? item
      : latest,
  );

/**
 * The batches on Load Desk, most recently added to first.
 *
 * A batch is a ticket date, but what makes one recent is when something last
 * went into it rather than the date printed on the paper: a ticket photographed
 * this morning puts its batch at the top even when the ticket itself is from
 * last month, because that is the pile being worked through. Sorting by the
 * printed date instead buried this morning's work behind every newer ticket
 * date already on file.
 *
 * Every group `groupByTicketDate` returns holds at least one record, which is
 * what `lastSavedIn` needs.
 */
export function batchesByRecency(records: SavedRecord[]) {
  return groupByTicketDate(records, (record) => record.ticket.ticket_date)
    .map((group) => ({ ...group, lastSaved: lastSavedIn(group.items) }))
    .sort(
      (a, b) =>
        b.lastSaved.saved_at.localeCompare(a.lastSaved.saved_at) ||
        b.lastSaved.id - a.lastSaved.id,
    );
}

/**
 * The upload a saved ticket belongs to. Tickets saved before uploads were
 * recorded are grouped by their invoice number instead.
 */
export const recordBatch = (record: SavedRecord) =>
  record.invoice_batch_id ?? `invoice:${invoiceKey(record.invoice.invoice_number)}`;

/**
 * The invoice number the changes would take from another upload, or null.
 * Tickets from one upload share an invoice number; no other upload may use it.
 * `id` is the saved ticket being changed, or null for one not saved yet.
 */
export function findInvoiceClash(
  records: SavedRecord[],
  changes: { id: number | null; invoiceNumber: string; batchId: string }[],
): string | null {
  const changing = new Set(changes.map((change) => change.id));
  for (const change of changes) {
    const key = invoiceKey(change.invoiceNumber);
    const taken = records.some(
      (record) =>
        !changing.has(record.id) &&
        invoiceKey(record.invoice.invoice_number) === key &&
        recordBatch(record) !== change.batchId,
    );
    if (taken) return change.invoiceNumber.trim();
  }
  return null;
}

const NUMBERED = /^(.*?)(\d+)$/;

/**
 * The invoice number after the latest numbered invoice, keeping its prefix
 * and zero padding: "2" → "3", "INV-0099" → "INV-0100". It is one past the
 * highest number with that prefix, so it never repeats one in use. Draft
 * numbers ("DRAFT-…") and numbers without trailing digits are skipped.
 * Returns null before the first numbered invoice, so that one is typed in.
 */
export function nextInvoiceNumber(numbersOldestFirst: string[]): string | null {
  const numbered = numbersOldestFirst
    .map((number) => number.trim())
    .filter((number) => !/^draft/i.test(number) && NUMBERED.test(number));
  const latest = numbered.at(-1);
  if (!latest) return null;
  const [, prefix, digits] = latest.match(NUMBERED)!;
  let highest = 0;
  for (const number of numbered) {
    const [, otherPrefix, otherDigits] = number.match(NUMBERED)!;
    if (otherPrefix.toLowerCase() === prefix.toLowerCase()) {
      highest = Math.max(highest, Number(otherDigits));
    }
  }
  return `${prefix}${String(highest + 1).padStart(digits.length, '0')}`;
}

/**
 * The invoice number each batch waiting for one takes, keyed by batch.
 *
 * The series is continued in ticket-date order, oldest first, whatever order
 * the batches were read in. One upload can hold several days' tickets, and the
 * pages come out of the reader in whatever order they were photographed, so
 * numbering them as they arrive puts invoice 1043 on the 14th and 1044 on the
 * 12th. Books read in number order, so the oldest date takes the number after
 * the last invoice on file and each later date takes the one after that.
 *
 * A batch whose tickets carry no date is not numbered at all — see
 * `UNDATED_BATCH` — and is left out of what is returned. A workspace with no
 * invoice to follow yet starts its numbering at `FIRST_INVOICE_NUMBER`, so a
 * dated batch is never left without a number.
 */
export function numbersForWaitingBatches(
  numbersOldestFirst: string[],
  waiting: { batchId: string; ticketDate: string | null }[],
): Map<string, string> {
  // One entry per batch: the tickets of a batch share its number. A batch
  // with no date is not an invoice and takes none; it waits for its date.
  const batches: { batchId: string; day: number | null; arrived: number }[] = [];
  for (const item of waiting) {
    if (batches.some((batch) => batch.batchId === item.batchId)) continue;
    if (ticketDateValue(item.ticketDate) === null) continue;
    batches.push({
      batchId: item.batchId,
      day: ticketDateValue(item.ticketDate),
      arrived: batches.length,
    });
  }
  const numbers = [...numbersOldestFirst];
  const taken = new Set(numbers.map(invoiceKey));
  const assigned = new Map<string, string>();
  const ordered = [...batches].sort(
    (a, b) => byDay(a.day, b.day) || a.arrived - b.arrived,
  );
  for (const batch of ordered) {
    let next = openingInvoiceNumber(numbers);
    // Never hand out a number something already carries. Two uploads finishing
    // within a moment of each other both read the ledger before either has
    // written to it, and the series each works out from it can overlap; the
    // second walks past what the first took rather than billing twice on one
    // number. Each step is past the highest number of that prefix, so this ends.
    while (taken.has(invoiceKey(next))) {
      numbers.push(next);
      next = openingInvoiceNumber(numbers);
    }
    numbers.push(next);
    taken.add(invoiceKey(next));
    assigned.set(batch.batchId, next);
  }
  return assigned;
}

/**
 * The numbers the given batches should carry so that they run in ticket-date
 * order, oldest first.
 *
 * An upload is read a page at a time and each page is filed the moment it lands,
 * so the first numbers handed out follow the order the pictures were taken. A
 * photograph of the 6th taken before one of the 19th took the lower number, and
 * the ledger then climbed in numbers while jumping about in dates. Once the
 * whole upload is in, every date is known and the run can be put right.
 *
 * Only these batches move. Every other invoice keeps the number it has, because
 * one that has been sent cannot be renamed, so the run continues after the
 * highest number outside this set rather than rearranging the whole ledger: an
 * invoice 1 for the 15th, and an upload of the 19th and the 6th, gives the 19th
 * 2 and the 6th 3.
 *
 * `batchIds` must therefore be batches the upload *opened* — never one it only
 * added a page to. A batch already on file is an invoice already numbered, and
 * handing it in here took its number away from it: a ticket photographed for a
 * date that was already invoiced pulled invoice 1 into the renumbering and left
 * it as invoice 2, with a batch uploaded this morning holding number 1.
 * `batchInvoiceFor` says which batches an upload opened.
 */
export function numbersByTicketDate(
  records: SavedRecord[],
  batchIds: string[],
): Map<string, string> {
  const renumbering = new Set(batchIds);
  const moving: SavedRecord[] = [];
  const staying: SavedRecord[] = [];
  for (const record of records) {
    (renumbering.has(recordBatch(record)) ? moving : staying).push(record);
  }
  const oldestFirst = (a: SavedRecord, b: SavedRecord) => a.id - b.id;
  return numbersForWaitingBatches(
    [...staying].sort(oldestFirst).map((record) => record.invoice.invoice_number),
    [...moving].sort(oldestFirst).map((record) => ({
      batchId: recordBatch(record),
      ticketDate: record.ticket.ticket_date,
    })),
  );
}

/**
 * Every dated invoice's number, so that the numbers run in date order across
 * the whole ledger: the oldest date takes the lowest number on file, the next
 * date the next, and a batch not numbered yet takes a new number past the
 * highest. Returned as the batches whose number would change, keyed by batch.
 *
 * Invoices used to keep their numbers for life, and an upload of older
 * tickets after a newer one left the books climbing in numbers while
 * jumping back in dates: invoice 1 for the 1st of January, then invoice 2
 * for the 31st of December. The ledger is asked to read in date order
 * instead, and where it does not the numbers are moved — a number is a
 * position in the books, and the books are in date order, with no gaps:
 * from the number the series starts at (`start`, set under Account or by
 * typing a number onto an invoice), else the lowest on file, one after
 * another, so an invoice deleted from the middle closes up behind it. Two batches on one day keep their
 * order between them. Numbers with no digits to order by are left alone,
 * with their batches; the undated batch is not an invoice and takes none.
 */
export function numbersInDateOrder(
  records: SavedRecord[],
  start: string | null | undefined = null,
): Map<string, string> {
  type Batch = { batchId: string; day: number; number: string | null; digits: number; arrived: number };
  const batches = new Map<string, Batch>();
  for (const record of [...records].sort((a, b) => a.id - b.id)) {
    const batchId = recordBatch(record);
    if (isUndatedBatch(batchId)) continue;
    const day = ticketDateValue(record.ticket.ticket_date);
    if (day === null) continue;
    if (batches.has(batchId)) continue;
    const number = record.invoice.invoice_number.trim();
    const pending = isPendingInvoiceNumber(number);
    const match = pending ? null : NUMBERED.exec(number);
    // A hand-typed number with no digits is somebody's own scheme; its batch
    // is not moved and its number is not in the pool.
    if (!pending && !match) continue;
    batches.set(batchId, {
      batchId,
      day,
      number: pending ? null : number,
      digits: match ? Number(match[2]) : Number.POSITIVE_INFINITY,
      arrived: batches.size,
    });
  }
  const list = [...batches.values()];
  if (!list.length) return new Map();
  const pool = list
    .filter((batch) => batch.number !== null)
    .sort((a, b) => a.digits - b.digits || a.arrived - b.arrived)
    .map((batch) => batch.number!);
  // One straight run from the lowest number on file — its prefix and
  // padding kept — one per dated invoice, oldest date first. A run, not the
  // pool as it was: an invoice deleted from the middle used to leave its
  // number as a gap for good, and the books read 1, 3, 4. The run closes it,
  // and 3 becomes 2. A ledger with no number yet starts at the first.
  // Where the run starts: the number the series was told to start at, or
  // failing that the lowest on file, or failing that the first.
  const first = start?.trim() && NUMBERED.test(start.trim()) ? start.trim() : (pool[0] ?? FIRST_INVOICE_NUMBER);
  const numbers: string[] = [];
  while (numbers.length < list.length) {
    numbers.push(numbers.length ? openingInvoiceNumber(numbers) : first);
  }
  const inOrder = [...list].sort((a, b) => a.day - b.day || a.digits - b.digits || a.arrived - b.arrived);
  const changes = new Map<string, string>();
  inOrder.forEach((batch, index) => {
    const wanted = numbers[index];
    if (wanted !== batch.number) changes.set(batch.batchId, wanted);
  });
  return changes;
}

/**
 * The number the series has to start at for `batchId` to carry `typed`
 * once the ledger is in date order, or null when the typed number is not
 * one to count from.
 *
 * A person typing 1001 onto the third-oldest invoice means the series runs
 * 999, 1000, 1001: the start is the typed number less the invoice's place
 * in date order, with the prefix and padding as typed. Typed onto the
 * oldest invoice, the start is the number itself — which is the common
 * case, the first invoice being given its number. A number too low for the
 * invoice's place (2 typed onto the fifth-oldest) cannot be that invoice's
 * in a series without a gap: the series starts at 1, the nearest there is,
 * and the invoice takes the number its place gives it. `unsaved` are
 * invoices being filed now and not on the ledger yet, counted in their
 * places.
 */
export function seriesStartFor(
  records: SavedRecord[],
  batchId: string,
  typed: string,
  unsaved: { batchId: string; date: string | null }[] = [],
): string | null {
  const number = typed.trim();
  const match = NUMBERED.exec(number);
  if (!match) return null;
  const dated = new Map(
    [...records]
      .sort((a, b) => a.id - b.id)
      .filter((record) => !isUndatedBatch(recordBatch(record)) && ticketDateValue(record.ticket.ticket_date) !== null)
      .map((record) => [recordBatch(record), ticketDateValue(record.ticket.ticket_date)!] as const),
  );
  for (const batch of unsaved) {
    const day = ticketDateValue(batch.date);
    if (day !== null && !isUndatedBatch(batch.batchId) && !dated.has(batch.batchId)) dated.set(batch.batchId, day);
  }
  const order = [...dated]
    .map(([id, day], arrived) => ({ id, day, arrived }))
    .sort((a, b) => a.day - b.day || a.arrived - b.arrived)
    .map((batch) => batch.id);
  const place = order.indexOf(batchId);
  if (place < 0) return null;
  const digits = Math.max(1, Number(match[2]) - place);
  return `${match[1]}${String(digits).padStart(match[2].length, '0')}`;
}

/** Every saved ticket on an invoice, in print order. */
export function invoiceLines(
  records: SavedRecord[],
  invoiceNumber: string,
): SavedRecord[] {
  const key = invoiceKey(invoiceNumber);
  return records
    .filter((record) => invoiceKey(record.invoice.invoice_number) === key)
    .sort(byTicketDate);
}

export type InvoiceGroup = {
  key: string;
  invoice: InvoiceDraft;
  records: SavedRecord[];
  tons: number;
  /** Sum of line totals for lines that have a rate. */
  total: number;
  needsRate: boolean;
  /**
   * Any ticket on the invoice carrying a field nobody has checked against the
   * original yet. Kept beside `needsRate` because the two say the same kind of
   * thing about an invoice — it is not ready to go out — and a screen that
   * showed one without the other would let a half-read weight print as a
   * finished line. A ticket saved before the recovery layer existed has no
   * record and so contributes nothing.
   */
  needsConfirmation: boolean;
  firstTicketDate: string | null;
  lastTicketDate: string | null;
};

/** Invoices built from saved tickets, newest invoice date first. */
export function invoiceGroups(records: SavedRecord[]): InvoiceGroup[] {
  const grouped = new Map<string, SavedRecord[]>();
  for (const record of records) {
    const key = invoiceKey(record.invoice.invoice_number);
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  return [...grouped.entries()]
    .map(([key, items]) => {
      const lines = [...items].sort(byTicketDate);
      const latest = items.reduce((a, b) => (b.id > a.id ? b : a));
      const totals = lines.map((record) => lineTotal(record.ticket));
      const dates = lines
        .map((record) => record.ticket.ticket_date)
        .filter((date): date is string => Boolean(date));
      return {
        key,
        invoice: latest.invoice,
        records: lines,
        tons: round2(lines.reduce((sum, record) => sum + recordTons(record), 0)),
        total: round2(
          totals.reduce<number>((sum, value) => sum + (value ?? 0), 0),
        ),
        needsRate: totals.some((value) => value === null),
        needsConfirmation: lines.some(
          (record) =>
            record.recovery !== undefined &&
            unresolvedCritical(record.recovery).length > 0,
        ),
        firstTicketDate: dates[0] ?? null,
        lastTicketDate: dates.at(-1) ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.invoice.invoice_date.localeCompare(a.invoice.invoice_date) ||
        Math.max(...b.records.map((r) => r.id)) -
          Math.max(...a.records.map((r) => r.id)),
    );
}

/** Where a workspace's numbering starts when it has no invoice to follow yet. */
export const FIRST_INVOICE_NUMBER = '1';

/**
 * What a batch carries between being filed and being numbered.
 *
 * A ticket is filed the moment it is read, and at that moment its invoice number
 * is not knowable: the numbers of an upload run in ticket-date order, and the
 * last page may turn out to be the oldest. So the batch is filed under a mark
 * instead, and the numbering runs once, when every page of the upload is in.
 * Claiming a real number per page as it landed is what put invoice 1043 on the
 * 14th and 1044 on the 12th.
 *
 * It names the batch, so two batches filed before either is numbered can never
 * key to one invoice — invoices are the saved tickets that share a number, and a
 * day's tickets on another day's bill is the thing that must not happen. It
 * begins with DRAFT, which `nextInvoiceNumber` already passes over, so a mark is
 * never mistaken for a number to count from.
 */
export const PENDING_PREFIX = 'DRAFT-';

export const pendingInvoiceNumber = (batchId: string) => `${PENDING_PREFIX}${batchId}`;

/** Whether this batch is filed but not yet numbered. */
export const isPendingInvoiceNumber = (invoiceNumber: string) =>
  /^draft-/i.test(invoiceNumber.trim());

/**
 * The number to put in front of somebody: nothing at all while the batch is
 * waiting for the rest of its upload. The mark is the app's own bookkeeping and
 * means nothing to whoever is invoicing, and showing it would be showing a
 * number that is not the one the invoice will carry.
 */
export const shownInvoiceNumber = (invoiceNumber: string) =>
  isPendingInvoiceNumber(invoiceNumber) ? '' : invoiceNumber.trim();

/**
 * The invoice number a new batch opens on: the next in the series, or the first
 * number when there is no series to continue.
 *
 * Always a real number. Tickets used to open on a draft named for their date
 * ("DRAFT-2026-01-06") so that a week of scanning could not burn a run of
 * numbers on invoices nobody sent; the cost was that the number on the review
 * screen was never the number the invoice would carry, and it had to be typed
 * over by hand every time. The number is claimed at the scan instead.
 *
 * Never an empty string: invoices are the saved tickets that share a number, so
 * two batches that both came back empty would key to one invoice and a day's
 * tickets would be billed on another day's.
 */
export function openingInvoiceNumber(numbersOldestFirst: string[]): string {
  return nextInvoiceNumber(numbersOldestFirst) ?? FIRST_INVOICE_NUMBER;
}

/**
 * Whether a ticket belongs on an invoice already covering `invoiceDate`.
 *
 * An invoice is one date's work. A ticket for another date does not join it,
 * however it got there — including through "Add tickets to this invoice",
 * which used to take whatever it was given and quietly put two dates on one
 * bill. A ticket whose date could not be read has nothing to disagree with, so
 * it joins: that is the multi-page scan whose second page lost its date line.
 */
export function joinsInvoiceFor(
  invoiceDate: string | null,
  ticketDate: string | null,
): boolean {
  const ticket = ticketDate?.trim();
  if (!ticket) return true;
  const invoice = invoiceDate?.trim();
  return !invoice || invoice === ticket;
}

/**
 * The saved ticket this one is a second photograph of, or null.
 *
 * A file is refused twice by its fingerprint, but the same sheet photographed
 * again is a new file, and it was saved again — on the invoice a second time,
 * billed twice. A plant's ticket number is the ticket, so a number already
 * on file from the same plant is the same ticket. Six digits at least, so a
 * short number two suppliers might both print is not mistaken for a repeat;
 * the plant compared where both name one (see `samePlant`).
 *
 * What this finds is only ever held for a person to compare (duplicates.ts),
 * never thrown away, so it leans towards asking: a repeat it misses is billed
 * twice, while a ticket it holds by mistake costs one look at two pictures.
 */
export function sameTicketOnFile(
  records: SavedRecord[],
  ticket: Pick<Ticket, 'ticket_number' | 'plant_name'> & Partial<Pick<Ticket, 'plant_code'>>,
): SavedRecord | null {
  const number = (ticket.ticket_number ?? '').replace(/\D/g, '');
  if (number.length < 6) return null;
  return (
    records.find(
      (record) =>
        (record.ticket.ticket_number ?? '').replace(/\D/g, '') === number &&
        samePlant(ticket, record.ticket),
    ) ?? null
  );
}

/** Words every supplier's name might carry, which say nothing about which one. */
const GENERIC_PLANT_WORDS = new Set([
  'AGGREGATE', 'AGGREGATES', 'MATERIAL', 'MATERIALS', 'CONCRETE', 'READY', 'MIX',
  'ASPHALT', 'STONE', 'SAND', 'GRAVEL', 'QUARRY', 'QUARRIES', 'ROCK', 'SUPPLY',
  'COMPANY', 'CO', 'INC', 'LLC', 'LTD', 'CORP', 'CORPORATION', 'THE', 'AND', 'OF',
  'PLANT', 'YARD',
]);

const plantWords = (name: string | null | undefined) =>
  new Set(
    normalizeName(name ?? '')
      .split(' ')
      .filter((word) => word.length > 1 && !GENERIC_PLANT_WORDS.has(word)),
  );

/**
 * Whether two tickets can be from the same plant, as far as their print says.
 *
 * The plant's name is read off a picture like everything else, and the same
 * sheet has come back as "NORTHFIELD Aggregates" from one photograph and
 * "NORTHFIELD" from the next — and the second copy, taken for another plant's
 * ticket, was filed on the invoice beside the first. So two names are the
 * same plant when they share a word that names it, or when the plant codes
 * printed on both agree; they are different plants only when both are read
 * and nothing in them agrees. A name with nothing distinctive in it, or no
 * name at all, is no disagreement.
 */
export function samePlant(
  a: Pick<Ticket, 'plant_name'> & Partial<Pick<Ticket, 'plant_code'>>,
  b: Pick<Ticket, 'plant_name'> & Partial<Pick<Ticket, 'plant_code'>>,
): boolean {
  const codeA = normalizeName(a.plant_code ?? '');
  const codeB = normalizeName(b.plant_code ?? '');
  if (codeA && codeA === codeB) return true;
  const wordsA = plantWords(a.plant_name);
  const wordsB = plantWords(b.plant_name);
  if (!wordsA.size || !wordsB.size) return true;
  return [...wordsA].some((word) => wordsB.has(word));
}

/** Photographed and read, but nobody has checked it against the picture yet. */
export const needsReview = (record: SavedRecord) =>
  !record.reviewed_at && !record.auto_approved_at;

/**
 * One ticket of a review, as the navigation sees it.
 *
 * `invoice` is the batch the ticket is on, which is what makes tickets one
 * invoice in this app — `recordBatch` for a saved one, `batch_id` on a queued
 * one. `day` is the day that invoice is dated, which is the day on its tickets;
 * it orders the invoices among themselves. `reviewed` is the ticket's own
 * `reviewed_at`, read after the save has been stored.
 */
export type ReviewStop = { invoice: string; day: number | null; reviewed: boolean };

/**
 * The tickets on one invoice, as positions in the queue, in the order the queue
 * shows them. That order is the review's own within an invoice: it is what the
 * numbered steps across the top of the panel are.
 */
export function invoiceStopsOf(stops: ReviewStop[], invoice: string): number[] {
  return stops.flatMap((stop, index) => (stop.invoice === invoice ? [index] : []));
}

/**
 * The invoices of a review, in the order it works through them: oldest invoice
 * date first, and where two fall on the same day the one whose first ticket
 * comes first in the queue. An invoice with no date to place goes last.
 *
 * The same order the numbers were handed out in, because an invoice is dated by
 * its tickets and the numbering runs by that date — so reviewing runs through
 * them the way the books read.
 */
function invoicesInOrder(stops: ReviewStop[]): string[] {
  const opens = new Map<string, { day: number | null; at: number }>();
  for (const [at, stop] of stops.entries()) {
    if (!opens.has(stop.invoice)) opens.set(stop.invoice, { day: stop.day, at });
  }
  return [...opens]
    .sort(([, a], [, b]) => byDay(a.day, b.day) || a.at - b.at)
    .map(([invoice]) => invoice);
}

/** Whether any ticket on this invoice is still waiting to be checked. */
const invoiceWaiting = (stops: ReviewStop[], invoice: string) =>
  invoiceStopsOf(stops, invoice).some((index) => !stops[index].reviewed);

/**
 * The first ticket waiting on the next invoice that has one, or -1.
 *
 * The invoice after this one in the order above, and if every invoice after it
 * is done with, one before it that is not: an invoice skipped past by hand is
 * still an invoice to finish, and the review does not end with work left on it.
 */
function nextWaitingInvoiceStop(stops: ReviewStop[], invoice: string): number {
  const order = invoicesInOrder(stops);
  const at = order.indexOf(invoice);
  const waiting = (other: string) => other !== invoice && invoiceWaiting(stops, other);
  const next = order.slice(at + 1).find(waiting) ?? order.slice(0, at).find(waiting);
  if (next === undefined) return -1;
  return invoiceStopsOf(stops, next).find((index) => !stops[index].reviewed) ?? -1;
}

/**
 * Where the review goes after the ticket at `from`, or -1 when nothing anywhere
 * is left to check.
 *
 * An invoice at a time, because an invoice is what gets sent: the rest of this
 * invoice first, then the next invoice with work on it. Within the invoice, what
 * follows the current ticket comes first — that is the order on the screen — and
 * only when nothing after it is waiting does this turn back to a ticket skipped
 * earlier on the same invoice. A ticket already checked is never offered again,
 * and neither is the one just finished.
 *
 * -1 means every invoice of the review is done with, and only then.
 */
export function nextReviewStop(stops: ReviewStop[], from: number): number {
  const current = stops[from];
  if (!current) return -1;
  const here = invoiceStopsOf(stops, current.invoice);
  const later = here.find((index) => index > from && !stops[index].reviewed);
  if (later !== undefined) return later;
  const skipped = here.find((index) => index !== from && !stops[index].reviewed);
  if (skipped !== undefined) return skipped;
  return nextWaitingInvoiceStop(stops, current.invoice);
}

/**
 * Where the back and next arrows go from `from`, or null when there is nowhere.
 *
 * They step through the invoice being reviewed, which is what the numbered steps
 * beside them are. At its far end they carry on rather than stopping dead:
 * forward to the first ticket waiting on the next invoice with work on it, back
 * to the last ticket of the invoice before. Crossing over is only ever at an
 * end — the invoice details on the panel belong to whichever invoice is open, so
 * landing on another one by accident in the middle of a run is what this avoids
 * — and back goes wherever forward came from, so the way on is never one-way.
 */
export function stepReviewStop(
  stops: ReviewStop[],
  from: number,
  direction: -1 | 1,
): number | null {
  const current = stops[from];
  if (!current) return null;
  const here = invoiceStopsOf(stops, current.invoice);
  if (direction === 1) {
    const later = here.find((index) => index > from);
    if (later !== undefined) return later;
    const onward = nextWaitingInvoiceStop(stops, current.invoice);
    return onward >= 0 ? onward : null;
  }
  const earlier = here.filter((index) => index < from).at(-1);
  if (earlier !== undefined) return earlier;
  const order = invoicesInOrder(stops);
  const before = order[order.indexOf(current.invoice) - 1];
  if (before === undefined) return null;
  return invoiceStopsOf(stops, before).at(-1) ?? null;
}

/**
 * The date a ticket is filed under; scans with no day read off them — blank or
 * unreadable alike — have a batch of their own.
 */
export const batchDate = (record: Pick<SavedRecord, 'ticket'>) =>
  ticketDay(record.ticket.ticket_date) ?? 'undated';

/**
 * The batch every ticket with no date read off it waits in — nothing printed
 * where the date should be, and equally a date the scan could not make a day
 * of. It is not an invoice and never takes a number: a ticket cannot be billed
 * for a day nobody knows, and a day read wrong is a day nobody knows.
 * Entering the date in review moves the ticket to that day's invoice.
 */
export const UNDATED_BATCH = 'batch-undated';
export const isUndatedBatch = (batchId: string) => batchId === UNDATED_BATCH;

/**
 * The batch suspected repeats wait in (see duplicates.ts): a page whose ticket
 * number is already on file, kept with its photograph until a person says
 * whether it is the same ticket. Like the undated batch it is not an invoice
 * and never takes a number.
 */
export const DUPLICATE_BATCH = 'batch-duplicates';
export const isDuplicateBatch = (batchId: string) => batchId === DUPLICATE_BATCH;

/**
 * The invoice a ticket photographed for `ticketDate` belongs on: the one the
 * other tickets of that date are already on, or a new batch for a date not filed
 * yet.
 *
 * A date already filed keeps the number it was filed under — that invoice
 * exists, may well have been sent, and the ticket simply joins it. A date not
 * filed yet opens a batch with no number, only the mark that says it is waiting
 * for one, because the number depends on dates that may still be in the reader.
 * `numbersByTicketDate` gives it its number when the upload is in.
 */
export function batchInvoiceFor(
  records: SavedRecord[],
  ticketDate: string | null,
): { invoice_number: string; batch_id: string; opened: boolean } {
  const date = ticketDay(ticketDate) ?? 'undated';
  // No day read off it: into the holding batch, on no invoice. Always the
  // mark, never a number an earlier undated ticket may have been given under
  // the old rule, so nothing undated is ever billed.
  if (date === 'undated') {
    return {
      invoice_number: pendingInvoiceNumber(UNDATED_BATCH),
      batch_id: UNDATED_BATCH,
      opened: !records.some((record) => recordBatch(record) === UNDATED_BATCH),
    };
  }
  const existing = records.find((record) => batchDate(record) === date);
  if (existing) {
    return {
      invoice_number: existing.invoice.invoice_number,
      batch_id: recordBatch(existing),
      opened: false,
    };
  }
  const batchId = `batch-${date}`;
  return {
    // Filed, not numbered. Whatever number is free at this moment would be one
    // claimed in the order the pictures were taken; the run is worked out in
    // ticket-date order once every page of the upload has been read.
    invoice_number: pendingInvoiceNumber(batchId),
    batch_id: batchId,
    // This upload's batch, so this upload's to number.
    opened: true,
  };
}

/**
 * Where a ticket goes once its date is what it is now.
 *
 * `stay`: it is already on the invoice of its date, or it is the only ticket on
 * its invoice — in which case the invoice is simply re-dated with it and keeps
 * its number, as a correction to one invoice should. `join`: another invoice
 * already holds that date's tickets, and this one belongs with them; it takes
 * their number and their invoice details. `open`: nothing is filed for that
 * date and the ticket is leaving tickets behind, so it opens an invoice of its
 * own, on the next number in the series.
 */
export type InvoiceMove =
  | { kind: 'stay' }
  | { kind: 'join'; batchId: string; invoice: InvoiceDraft }
  | { kind: 'open'; batchId: string; invoiceNumber: string };

/**
 * A ticket belongs on the invoice of its date. Correcting the date on a ticket
 * used to change the date on its invoice and leave it there — a ticket for the
 * 2nd sitting on the 1st's invoice, or, worse, the 1st's invoice re-dated to
 * the 2nd with all its other tickets still printed for the 1st. Now the ticket
 * goes where its date goes.
 *
 * `others` is every other saved ticket; `queued` every other ticket in the
 * queue that is not saved yet, with the upload it is on and its date as it is
 * now. Both are needed to know whether the ticket is leaving anyone behind.
 * Decided as the ticket is saved, from what is stored, not from what the
 * screen showed before the edit.
 */
export function invoiceMoveFor(
  ticket: { batchId: string; date: string | null },
  others: SavedRecord[],
  queued: { batchId: string; date: string | null }[] = [],
): InvoiceMove {
  const target = batchInvoiceFor(others, ticket.date);
  if (!target.opened) {
    // Its date is already filed. On this very invoice, nothing moves.
    if (target.batch_id === ticket.batchId) return { kind: 'stay' };
    const there = others.find((record) => recordBatch(record) === target.batch_id)!;
    return { kind: 'join', batchId: target.batch_id, invoice: there.invoice };
  }
  const leftBehind =
    others.some((record) => recordBatch(record) === ticket.batchId) ||
    queued.some((item) => item.batchId === ticket.batchId);
  // The holding batch for undated tickets is not an invoice: a ticket given
  // its date leaves it whether or not anything is left behind, onto an
  // invoice of its own.
  // Nor is the batch suspected repeats wait in: one found to be a different
  // ticket leaves it for its date's invoice.
  if (
    !leftBehind &&
    !(isUndatedBatch(ticket.batchId) && ticketDay(ticket.date)) &&
    !isDuplicateBatch(ticket.batchId)
  ) {
    return { kind: 'stay' };
  }
  const numbers = [...others]
    .sort((a, b) => a.id - b.id)
    .map((record) => record.invoice.invoice_number);
  const invoiceNumber = numbersForWaitingBatches(numbers, [
    { batchId: target.batch_id, ticketDate: ticket.date },
  ]).get(target.batch_id)!;
  return { kind: 'open', batchId: target.batch_id, invoiceNumber };
}

/**
 * The invoice a saved ticket takes once its date is `date`: the details and
 * the batch, worked out from `invoiceMoveFor` against every other saved
 * ticket. `batchId` is null when the ticket stays where it is. Every path
 * that gives a ticket its date goes through here — the date box in the
 * panel, a job confirmed for a group of tickets, the ledger's own repair —
 * because a ticket dated and left on the undated batch is a ticket nobody
 * can bill: the group answer used to set the date and leave the ticket
 * there, checked, on "Date not found" for good.
 */
export function invoicePlacement(
  record: SavedRecord,
  date: string,
  records: SavedRecord[],
): { invoice: InvoiceDraft; batchId: string | null } {
  const others = records.filter((other) => other.id !== record.id);
  const move = invoiceMoveFor({ batchId: recordBatch(record), date }, others, []);
  if (move.kind === 'join') {
    return {
      invoice: { ...move.invoice, bill_to: { ...move.invoice.bill_to }, invoice_date: date },
      batchId: move.batchId,
    };
  }
  if (move.kind === 'open') {
    return {
      invoice: { ...record.invoice, invoice_number: move.invoiceNumber, invoice_date: date },
      batchId: move.batchId,
    };
  }
  return { invoice: { ...record.invoice, invoice_date: date }, batchId: null };
}

/**
 * Saved tickets that have a date and are still on the undated batch. They
 * belong on their date's invoice, and the ledger puts them there (see
 * `reorderInvoicesByDate`): however they came to be dated, a ticket with a
 * day is not one waiting for its day.
 */
export const strandedDated = (records: SavedRecord[]): SavedRecord[] =>
  records.filter(
    (record) => isUndatedBatch(recordBatch(record)) && ticketDay(record.ticket.ticket_date) !== null,
  );

export const ticketStatus = (record: SavedRecord) =>
  // With the recovery record, so a ticket whose fields are still waiting on a
  // person reads the same here — in the list, the filter and the count — as it
  // does on the review screen that will not let it be saved.
  validateTicket(record.ticket, record.recovery).length ? 'needs_review' : 'valid';

/** Every search word must appear in the ticket, invoice, truck or bill-to. */
export function recordMatches(record: SavedRecord, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const { ticket, invoice } = record;
  const text = [
    ticket.ticket_number,
    ticket.customer_name,
    ticket.customer_id,
    ticket.project_name,
    ticket.project_address,
    ticket.product_code,
    ticket.product_description,
    ticket.plant_name,
    ticket.vehicle_id,
    invoice.invoice_number,
    invoice.truck_number,
    invoice.bill_to.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.every((term) => text.includes(term));
}

const INVOICE_COLUMNS: [string, (group: InvoiceGroup) => string | number | null][] = [
  ['invoice_number', (g) => g.invoice.invoice_number],
  ['invoice_date', (g) => g.invoice.invoice_date],
  ['return_date', (g) => g.invoice.return_date || null],
  ['truck_number', (g) => g.invoice.truck_number || null],
  ['bill_to', (g) => g.invoice.bill_to.name],
  ['tickets', (g) => g.records.length],
  ['ticket_numbers', (g) => g.records.map((r) => r.ticket.ticket_number ?? '').join('; ')],
  [
    'customers',
    (g) => [...new Set(g.records.map((r) => r.ticket.customer_name ?? ''))].join('; '),
  ],
  ['first_ticket_date', (g) => g.firstTicketDate],
  ['last_ticket_date', (g) => g.lastTicketDate],
  ['net_tons', (g) => g.tons],
  ['total', (g) => g.total],
  ['status', (g) => (g.needsRate ? 'draft' : 'rated')],
  ['needs_confirmation', (g) => (g.needsConfirmation ? 'true' : 'false')],
];

export function invoicesCsv(groups: InvoiceGroup[]): string {
  const rows = groups.map((group) =>
    INVOICE_COLUMNS.map(([, read]) => csvCell(read(group))).join(','),
  );
  return [INVOICE_COLUMNS.map(([name]) => name).join(','), ...rows].join('\r\n');
}
