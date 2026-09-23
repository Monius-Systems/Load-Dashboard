import { business } from './business.ts';
import { unresolvedCritical } from './recovery/index.ts';
import { validateTicket } from './validate.ts';
import {
  fuelTypeOf,
  rateTypeOf,
  type FuelType,
  type RateType,
  type SavedRecord,
  type Ticket,
} from './types.ts';

const pad2 = (value: number) => String(value).padStart(2, '0');

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** 2025-01-07 -> 1/7/2025, as printed on the reference invoice. */
export function displayDate(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match
    ? `${Number(match[2])}/${Number(match[3])}/${match[1]}`
    : (value ?? '');
}

/**
 * Invoice destination: street, town and state only.
 * "31480 EDISON RD, NEW CARLISLE,IN 46552 US" -> "31480 EDISON RD, NEW CARLISLE, IN".
 */
export function invoiceDestination(address: string | null): string {
  if (!address) return '';
  return address
    .replace(/[\s,]+(?:USA?|UNITED STATES(?: OF AMERICA)?)\.?\s*$/i, '')
    .replace(/[\s,]+\d{5}(?:-\d{4})?\s*$/, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/[\s,]+$/, '')
    .trim();
}

/**
 * Invoice origin: the configured label for Heidelberg Thornton, otherwise the
 * plant name with its town and state ("ONTARIO TRAP ROCK CHICAGO IL").
 */
export function invoiceOrigin(
  ticket: Pick<Ticket, 'plant_name' | 'plant_address'>,
): string {
  if (!ticket.plant_name) return '';
  if (/heidelberg/i.test(ticket.plant_name)) return business.origin_label;
  const parts = (ticket.plant_address ?? '')
    .split(',')
    .map((part) => part.trim().replace(/\s+\d{5}(?:-\d{4})?$/, ''))
    .filter(Boolean);
  const place = parts.length >= 2 ? `${parts.at(-2)} ${parts.at(-1)}` : '';
  return `${ticket.plant_name} ${place}`.trim().toUpperCase();
}

/** Net tons: printed net tons, or net pounds / 2,000; null without a weight. */
export function ticketTons(
  ticket: Pick<Ticket, 'net_tons' | 'net_lb'>,
): number | null {
  return ticket.net_tons ?? (ticket.net_lb === null ? null : ticket.net_lb / 2000);
}

/** Invoice weight: net tons to hundredths. */
export function invoiceTons(ticket: Pick<Ticket, 'net_tons' | 'net_lb'>): string {
  const tons = ticketTons(ticket);
  return tons === null ? '' : tons.toFixed(2);
}

export const money = (value: number | null) =>
  value === null
    ? ''
    : `$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

export const pounds = (value: number | null) =>
  value === null ? 'Not found' : `${value.toLocaleString('en-US')} lb`;

/** Rounds to cents; the toFixed step keeps 286.375 from landing on 286.37. */
const round2 = (value: number) => Math.round(Number((value * 100).toFixed(6))) / 100;

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  flat: 'Flat rate',
  hourly: 'Hourly',
  per_ton: 'Per ton',
};

/** What one unit of the rate is. */
export const RATE_UNITS: Record<RateType, string> = {
  flat: 'per load',
  hourly: 'per hour',
  per_ton: 'per ton',
};

const RATE_SUFFIX: Record<RateType, string> = { flat: '', hourly: '/hr', per_ton: '/ton' };

/** $150.00, $95.00/hr or $12.50/ton; empty without a rate. */
export const formatRate = (rate: number | null, type: RateType) =>
  rate === null ? '' : `${money(rate)}${RATE_SUFFIX[type]}`;

const formatHours = (hours: number) =>
  `${Number(hours.toFixed(2))} hr${hours === 1 ? '' : 's'}`;

/**
 * How many rate units a ticket bills: one load, its hours, or its net tons to
 * hundredths (as printed on the invoice). Null when that is not known yet.
 */
export function rateQuantity(ticket: Ticket): number | null {
  const type = rateTypeOf(ticket);
  if (type === 'flat') return 1;
  if (type === 'hourly') return ticket.hours;
  const tons = ticketTons(ticket);
  return tons === null ? null : round2(tons);
}

/** Rate times quantity, before fuel. Null until both are known. */
export function rateAmount(ticket: Ticket): number | null {
  const quantity = rateQuantity(ticket);
  if (ticket.rate === null || quantity === null) return null;
  return round2(ticket.rate * quantity);
}

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  flat: 'Flat amount',
  percent: 'Percent of rate',
};

/** $20.00 or 15%; empty without a fuel charge. */
export const formatFuel = (fuel: number | null | undefined, type: FuelType) =>
  fuel == null
    ? ''
    : type === 'percent'
      ? `${Number(fuel.toFixed(3))}%`
      : money(fuel);

/**
 * Fuel on a line: the flat amount, or the percentage of the rate amount. Zero
 * without a fuel charge; null while a percentage has no rate amount to apply to.
 */
export function fuelAmount(ticket: Ticket): number | null {
  if (ticket.fuel_charge == null) return 0;
  if (fuelTypeOf(ticket) === 'flat') return ticket.fuel_charge;
  const base = rateAmount(ticket);
  return base === null ? null : round2((base * ticket.fuel_charge) / 100);
}

/** Rate amount plus fuel. Null (a draft line) until all of it is known. */
export function lineTotal(ticket: Ticket): number | null {
  const base = rateAmount(ticket);
  if (base === null) return null;
  return round2(base + (fuelAmount(ticket) ?? 0));
}

/** The invoice's Fuel Charge cell: the amount, with the percentage when it is one. */
export function invoiceFuel(ticket: Ticket): string {
  if (ticket.fuel_charge == null) return '';
  if (fuelTypeOf(ticket) === 'flat') return money(ticket.fuel_charge);
  const amount = fuelAmount(ticket);
  const percent = formatFuel(ticket.fuel_charge, 'percent');
  return amount === null ? percent : `${money(amount)} (${percent})`;
}

/** The invoice's Rate cell: the rate with its unit, and the hours on hourly lines. */
export function invoiceRate(ticket: Ticket): string {
  const type = rateTypeOf(ticket);
  const rate = formatRate(ticket.rate, type);
  return rate && type === 'hourly' && ticket.hours !== null
    ? `${rate} × ${formatHours(ticket.hours)}`
    : rate;
}

/** The line total worked out, for review: "22.91 Tons × $12.50 + $20.00 fuel = $306.38". */
export function lineBreakdown(ticket: Ticket): string {
  const type = rateTypeOf(ticket);
  if (ticket.rate === null) return 'Draft until a rate is added.';
  const quantity = rateQuantity(ticket);
  if (quantity === null) {
    return type === 'hourly'
      ? 'Enter the hours to work out the total.'
      : 'Enter the net weight to work out the total.';
  }
  const base =
    type === 'flat'
      ? `${money(ticket.rate)} per load`
      : type === 'hourly'
        ? `${formatHours(quantity)} × ${money(ticket.rate)}`
        : `${quantity.toFixed(2)} Tons × ${money(ticket.rate)}`;
  const fuel = !ticket.fuel_charge
    ? ''
    : fuelTypeOf(ticket) === 'percent'
      ? ` + ${formatFuel(ticket.fuel_charge, 'percent')} fuel (${money(fuelAmount(ticket))})`
      : ` + ${money(ticket.fuel_charge)} fuel`;
  return `${base}${fuel} = ${money(lineTotal(ticket))}`;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Hashing needs a secure page (localhost or HTTPS).');
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * The fields of a ticket nobody has confirmed against the original yet, for
 * the export; empty for a ticket that never went through the reader.
 */
const recoveryStatus = (record: SavedRecord): string =>
  record.recovery ? unresolvedCritical(record.recovery).join(', ') : '';

const LEDGER_COLUMNS: [string, (record: SavedRecord) => string | number | null][] = [
  ['record_id', (r) => r.id],
  ['ticket_date', (r) => r.ticket.ticket_date],
  ['ticket_number', (r) => r.ticket.ticket_number],
  ['customer_id', (r) => r.ticket.customer_id],
  ['customer_name', (r) => r.ticket.customer_name],
  ['order_number', (r) => r.ticket.order_number],
  ['project_name', (r) => r.ticket.project_name],
  ['project_address', (r) => r.ticket.project_address],
  ['product_code', (r) => r.ticket.product_code],
  ['product_description', (r) => r.ticket.product_description],
  ['gross_lb', (r) => r.ticket.gross_lb],
  ['tare_lb', (r) => r.ticket.tare_lb],
  ['net_lb', (r) => r.ticket.net_lb],
  ['net_tons', (r) => r.ticket.net_tons],
  ['carrier_id', (r) => r.ticket.carrier_id],
  ['carrier_name', (r) => r.ticket.carrier_name],
  ['vehicle_id', (r) => r.ticket.vehicle_id],
  ['truck_number', (r) => r.invoice.truck_number || null],
  ['dispatch_number', (r) => r.ticket.dispatch_number],
  ['delivery_status', (r) => r.ticket.delivery_status],
  ['rate', (r) => r.ticket.rate],
  ['rate_type', (r) => rateTypeOf(r.ticket)],
  ['hours', (r) => r.ticket.hours ?? null],
  ['fuel_charge', (r) => r.ticket.fuel_charge],
  ['fuel_type', (r) => fuelTypeOf(r.ticket)],
  ['fuel_amount', (r) => fuelAmount(r.ticket)],
  ['line_total', (r) => lineTotal(r.ticket)],
  [
    'validation_status',
    (r) => (validateTicket(r.ticket, r.recovery).length ? 'needs_review' : 'valid'),
  ],
  ['validation_issues', (r) => validateTicket(r.ticket, r.recovery).join('; ')],
  ['source_file', (r) => r.source.file_name],
  ['source_sha256', (r) => r.source.sha256],
  ['invoice_number', (r) => r.invoice.invoice_number],
  ['invoice_date', (r) => r.invoice.invoice_date],
  // Last, so every column a spreadsheet already refers to by position stays
  // where it was. `unresolvedCritical` rather than a second list of what
  // counts as unsettled: the export, the invoice chip and the save button
  // should never be able to disagree about which fields are still open.
  ['recovery_status', recoveryStatus],
];

export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  // Keep spreadsheet apps from evaluating text as a formula.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ledgerCsv(records: SavedRecord[]): string {
  const rows = [...records]
    .sort((a, b) => a.id - b.id)
    .map((record) =>
      LEDGER_COLUMNS.map(([, read]) => csvCell(read(record))).join(','),
    );
  return [LEDGER_COLUMNS.map(([name]) => name).join(','), ...rows].join('\r\n');
}

/**
 * How large a name may be set to fit the width it has been given.
 *
 * The two names at the top of an invoice -- the client's on the left and the
 * company's own on the right -- sit in blocks of a fixed width, so that the
 * word INVOICE stays on the centre of the page and the company block stays
 * centred beside it whoever is being billed. A name too long for its block
 * therefore gives way instead of the block: it is set at the largest size
 * that fits, rather than widening the column and shoving the rest of the
 * sheet about.
 *
 * `width` is what the name measures at 100px, so the size that exactly fills
 * `room` is `room / width * 100`. It is taken down to the half pixel, held
 * between `min` and `max`, and reported as `wrapped` when even `min` is too
 * wide -- there are no sizes left to give up, and the caller lets the name
 * take a second line rather than run off the edge of the paper.
 */
export function nameFit(
  width: number,
  room: number,
  max: number,
  min: number,
): { size: number; wrapped: boolean } {
  if (width <= 0) return { size: max, wrapped: false };
  // Halves of a pixel, counted before the division rather than after it: a
  // size that lands exactly on a half comes out a hair under it otherwise,
  // and is rounded down a whole step for nothing.
  const fits = Math.floor((room * 200) / width) / 2;
  return { size: Math.min(max, Math.max(min, fits)), wrapped: fits < min };
}

/** A file size in the words a person uses for one. */
export const fileSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} bytes`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
