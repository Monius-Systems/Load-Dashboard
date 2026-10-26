// A ticket on file that a new one looks like, though its number came out
// different.
//
// The number is read off a picture, and a photograph of a sheet already on
// file can come back a digit long, a digit short, a digit wrong or with two
// digits turned round — and then the exact-number check (sameTicketOnFile)
// waves it through, onto the invoice, billed twice. This looks past the number
// at everything else the paper says about the load.
//
// What it must not do is hold up the day's real work. One truck hauling one
// job for one plant all day brings back tickets that agree on almost
// everything: the same plant, day, truck, order and product, the same tare,
// and — on this workspace's own books, twenty-one times — the very same gross
// and net to the pound. What tells those loads apart is their numbers, which
// run on through the day tens and hundreds apart. So the number stays the
// main witness: a near-miss on it, one slip of the reader, is what makes a
// look-alike a suspect, and the weights have to agree with it. A number far
// from any on file is a different ticket unless the paper carries something
// only one load can have — a time, the day's running count — and that agrees
// too. Anything the two tickets clearly disagree on makes them two loads.
//
// What this finds is held for a person to compare (duplicates.ts), never
// thrown away.

import { samePlant } from './records.ts';
import { ticketDay } from './ticket-date.ts';
import type { SavedRecord, Ticket } from './types.ts';

/** How one reading of a number is one slip of the reader from another. */
export type NumberSlip = 'digit_added' | 'digit_dropped' | 'digit_changed' | 'digits_swapped';

const digitsOf = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(value).replace(/\D/g, '');

/**
 * How `read` is one slip from `onFile`, or null when it is not: the same, or
 * further apart than one digit added, dropped or changed, or two neighbours
 * swapped.
 */
export function numberSlip(read: string, onFile: string): NumberSlip | null {
  if (read === onFile) return null;
  if (read.length === onFile.length + 1) {
    for (let i = 0; i < read.length; i++) {
      if (read.slice(0, i) + read.slice(i + 1) === onFile) return 'digit_added';
    }
    return null;
  }
  if (read.length + 1 === onFile.length) {
    for (let i = 0; i < onFile.length; i++) {
      if (onFile.slice(0, i) + onFile.slice(i + 1) === read) return 'digit_dropped';
    }
    return null;
  }
  if (read.length !== onFile.length) return null;
  const differ: number[] = [];
  for (let i = 0; i < read.length; i++) if (read[i] !== onFile[i]) differ.push(i);
  if (differ.length === 1) return 'digit_changed';
  if (
    differ.length === 2 &&
    differ[1] === differ[0] + 1 &&
    read[differ[0]] === onFile[differ[1]] &&
    read[differ[1]] === onFile[differ[0]]
  ) {
    return 'digits_swapped';
  }
  return null;
}

/** Whether two short codes (a truck, an order) are the same, give or take one slip. */
const sameCode = (a: string, b: string) =>
  a === b || (a.length >= 3 && b.length >= 3 && sameWithinOne(a, b));

function sameWithinOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let differ = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++differ > 1) return false;
    return true;
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  return false;
}

const code = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const clock = (value: string | null | undefined) => {
  const match = (value ?? '').match(/(\d{1,2})\s*:\s*(\d{2})/);
  return match ? `${Number(match[1])}:${match[2]}` : '';
};

/** Fields only one load can carry: when both tickets have one, it decides. */
const PER_LOAD = ['time_in', 'time_out', 'today_loads', 'today_tons', 'remaining_loads'] as const;
type PerLoad = (typeof PER_LOAD)[number];
const perLoadValue = (ticket: Ticket, field: PerLoad) =>
  field === 'time_in' || field === 'time_out' ? clock(ticket[field]) : ticket[field] === null ? '' : String(ticket[field]);

const LABELS: Record<PerLoad, string> = {
  time_in: 'time in',
  time_out: 'time out',
  today_loads: "the day's load count",
  today_tons: "the day's tons",
  remaining_loads: 'loads remaining',
};

const SLIPS: Record<NumberSlip, string> = {
  digit_added: 'a digit added',
  digit_dropped: 'a digit missing',
  digit_changed: 'one digit different',
  digits_swapped: 'two digits swapped',
};

/** Equal to the pound, both read; a weight not read on either side says nothing. */
const sameWeight = (a: number | null, b: number | null) => a !== null && b !== null && a === b;
const otherWeight = (a: number | null, b: number | null) => a !== null && b !== null && a !== b;

/**
 * Why two tickets are two loads, or null when nothing on them says so: another
 * plant, another day, another truck, another order, a time or running count
 * of their own, or both the gross and the net weighing differently. One
 * figure out on its own is not enough to part them — it may be the misread.
 */
export function differentLoad(a: Ticket, b: Ticket): string | null {
  if (!samePlant(a, b)) return 'another plant';
  const dayA = ticketDay(a.ticket_date);
  const dayB = ticketDay(b.ticket_date);
  if (dayA && dayB && dayA !== dayB) return 'another day';
  const truckA = code(a.vehicle_id);
  const truckB = code(b.vehicle_id);
  if (truckA && truckB && !sameCode(truckA, truckB)) return 'another truck';
  const orderA = code(a.order_number);
  const orderB = code(b.order_number);
  if (orderA && orderB && !sameCode(orderA, orderB)) return 'another order';
  for (const field of PER_LOAD) {
    const x = perLoadValue(a, field);
    const y = perLoadValue(b, field);
    if (x && y && x !== y) return `another ${LABELS[field]}`;
  }
  if (otherWeight(a.gross_lb, b.gross_lb) && otherWeight(a.net_lb, b.net_lb)) return 'other weights';
  return null;
}

export type Resemblance = {
  record: SavedRecord;
  /** How the numbers are one slip apart, or null when the paper spoke instead. */
  slip: NumberSlip | null;
  /** What the two tickets agree on, said as a person would check it. */
  reasons: string[];
};

/** What two tickets agree on, for the reasons given to the person comparing them. */
function agreements(a: Ticket, b: Ticket): string[] {
  const out: string[] = [];
  if (a.plant_name && b.plant_name) out.push('the same plant');
  const day = ticketDay(a.ticket_date);
  if (day && day === ticketDay(b.ticket_date)) out.push(`the same day (${day})`);
  if (code(a.vehicle_id) && code(a.vehicle_id) === code(b.vehicle_id)) out.push(`the same truck (${a.vehicle_id})`);
  if (sameWeight(a.gross_lb, b.gross_lb)) out.push(`gross ${a.gross_lb} lb`);
  if (sameWeight(a.tare_lb, b.tare_lb)) out.push(`tare ${a.tare_lb} lb`);
  if (sameWeight(a.net_lb, b.net_lb)) out.push(`net ${a.net_lb} lb`);
  for (const field of PER_LOAD) {
    const x = perLoadValue(a, field);
    if (x && x === perLoadValue(b, field)) out.push(`${LABELS[field]} ${x}`);
  }
  return out;
}

/**
 * The ticket on file the new one most likely is, though its number differs,
 * or null. Tickets with exactly its number are sameTicketOnFile's to find and
 * are passed over here.
 *
 * A suspect when nothing parts the two (see `differentLoad`) and either
 *  - the numbers are one slip apart and the gross or the net agrees to the
 *    pound, or
 *  - the number is far off or unread, but gross and net both agree, the day
 *    is the same, and a field only one load can have agrees as well.
 */
export function resemblingTicketOnFile(records: SavedRecord[], ticket: Ticket): Resemblance | null {
  const read = digitsOf(ticket.ticket_number);
  let best: { found: Resemblance; score: number } | null = null;
  for (const record of records) {
    const other = record.ticket;
    const onFile = digitsOf(other.ticket_number);
    if (read && read === onFile) continue;
    if (differentLoad(ticket, other)) continue;
    // Six digits on one side at least, as for an exact repeat; the other may
    // be the one that lost a digit.
    const slip =
      Math.min(read.length, onFile.length) >= 5 && Math.max(read.length, onFile.length) >= 6
        ? numberSlip(read, onFile)
        : null;
    const weighs = sameWeight(ticket.gross_lb, other.gross_lb) || sameWeight(ticket.net_lb, other.net_lb);
    const bothWeights = sameWeight(ticket.gross_lb, other.gross_lb) && sameWeight(ticket.net_lb, other.net_lb);
    const day = ticketDay(ticket.ticket_date);
    const sameDay = !!day && day === ticketDay(other.ticket_date);
    const ownField = PER_LOAD.some((field) => {
      const x = perLoadValue(ticket, field);
      return !!x && x === perLoadValue(other, field);
    });
    const suspect = slip ? weighs : bothWeights && sameDay && ownField;
    if (!suspect) continue;
    const agreed = agreements(ticket, other);
    const reasons = [
      slip
        ? `Ticket number ${ticket.ticket_number} is ${other.ticket_number} with ${SLIPS[slip]}.`
        : read
          ? `Ticket number ${ticket.ticket_number} is not ${other.ticket_number}, but everything else agrees.`
          : `No ticket number was read, and everything else agrees with ticket ${other.ticket_number}.`,
      `Both have ${agreed.join(', ')}.`,
    ];
    // The likeliest: a slip of the number over a match of the paper alone,
    // then whichever agrees on more.
    const score = (slip ? 100 : 0) + agreed.length;
    if (!best || score > best.score) best = { found: { record, slip, reasons }, score };
  }
  return best?.found ?? null;
}
