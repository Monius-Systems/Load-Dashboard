import type { DuplicateReview } from './duplicates.ts';
import type { ObservedTicket, TicketRecovery } from './recovery/contract.ts';

// Ticket fields mirror load_ticket_mvp/models.py so records stay compatible
// with the Python Load Desk ledger.
export const TEXT_FIELDS = [
  'plant_code',
  'plant_name',
  'plant_address',
  'ticket_number',
  'ticket_date',
  'time_in',
  'time_out',
  'customer_id',
  'customer_name',
  'order_number',
  'project_name',
  'project_address',
  'po_number',
  'product_code',
  'product_description',
  'other_charge',
  'dispatch_number',
  'delivery_status',
  'carrier_id',
  'carrier_name',
  'vehicle_id',
  'weighmaster',
  /** flat, hourly or per_ton (see RATE_TYPES); null means flat. */
  'rate_type',
  /** flat or percent (see FUEL_TYPES); null means flat. */
  'fuel_type',
] as const;

export const NUMBER_FIELDS = [
  'gross_lb',
  'tare_lb',
  'net_lb',
  'gross_tons',
  'tare_tons',
  'net_tons',
  'ordered_loads',
  'remaining_loads',
  'today_tons',
  'today_loads',
  'rate',
  'fuel_charge',
  /** Hours billed on an hourly rate. */
  'hours',
] as const;

export type TextField = (typeof TEXT_FIELDS)[number];
export type NumberField = (typeof NUMBER_FIELDS)[number];

export type Ticket = { [K in TextField]: string | null } & {
  [K in NumberField]: number | null;
};

export const isNumberField = (name: string): name is NumberField =>
  (NUMBER_FIELDS as readonly string[]).includes(name);

/**
 * How a ticket's rate is charged: once per load, per hour worked, or per net
 * ton hauled. Tickets saved before rate types existed are flat.
 */
export const RATE_TYPES = ['flat', 'hourly', 'per_ton'] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const isRateType = (value: unknown): value is RateType =>
  (RATE_TYPES as readonly unknown[]).includes(value);

export const rateTypeOf = (ticket: Pick<Ticket, 'rate_type'>): RateType =>
  isRateType(ticket.rate_type) ? ticket.rate_type : 'flat';

/**
 * How a fuel charge is added: a flat dollar amount, or a percentage of the
 * rate amount. Fuel charges saved before fuel types existed are flat.
 */
export const FUEL_TYPES = ['flat', 'percent'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const isFuelType = (value: unknown): value is FuelType =>
  (FUEL_TYPES as readonly unknown[]).includes(value);

export const fuelTypeOf = (ticket: Pick<Ticket, 'fuel_type'>): FuelType =>
  isFuelType(ticket.fuel_type) ? ticket.fuel_type : 'flat';

export function emptyTicket(): Ticket {
  const ticket: Record<string, null> = {};
  for (const name of [...TEXT_FIELDS, ...NUMBER_FIELDS]) ticket[name] = null;
  return ticket as Ticket;
}

export type BillTo = {
  name: string;
  address_lines: [string, string];
  phone: string;
};

export type InvoiceDraft = {
  invoice_number: string;
  invoice_date: string;
  return_date: string;
  truck_number: string;
  bill_to: BillTo;
};

export type SourceKind = 'upload' | 'sample';

export type TicketSource = {
  file_name: string;
  sha256: string;
  page?: number;
  size: number;
  type: string;
  kind: SourceKind;
};

/** A ticket waiting for review in the current tab. */
export type QueueItem = {
  id: string;
  source: TicketSource;
  original: Blob;
  preview_url: string;
  /** A scan reopened from saved records loads after the ticket opens. */
  preview_status: 'ready' | 'loading' | 'missing';
  ocr_text: string;
  note: string;
  /**
   * The note says why the ticket came back empty, rather than how it was read.
   * A ticket from a supplier whose layout is not supported parses to nothing,
   * and saying so is the difference between a puzzle and an instruction.
   */
  note_problem?: boolean;
  ticket: Ticket;
  /**
   * The ticket as the reader saw it, field by field, before anything was made
   * of it. Kept beside `ticket` so the review screen can show the print that
   * was there against the value that stands. Absent for a ticket read by a
   * path that does not observe, and for scans reopened from saved records.
   */
  observed?: ObservedTicket;
  /**
   * What the resolver decided about each field and why. Carried through review
   * and saved with the ticket, so a figure on an invoice can be traced back to
   * the paper. Absent until the ticket has been through the reader.
   */
  recovery?: TicketRecovery;
  invoice: InvoiceDraft;
  saved_record_id: number | null;
  /** Customer profile matched from the ticket or chosen in review. */
  customer_profile_id: number | null;
  /** Truck profile chosen for the upload or in review. */
  truck_id: number | null;
  /** Tickets extracted together share one invoice. */
  batch_id: string;
  /** The editable fields as last saved, to spot unsaved changes; null until saved. */
  baseline: string | null;
  /** Reopened from saved records for editing, rather than uploaded in this tab. */
  from_saved: boolean;
};

/** A saved ticket, its invoice and a pointer to the stored original. */
export type SavedRecord = {
  id: number;
  saved_at: string;
  ticket: Ticket;
  /**
   * How each field of the ticket came to be what it is: the print that was
   * seen, what was made of it and on what evidence. Absent on tickets saved
   * before recovery existed, and present only for tickets read through the
   * reader since; a ticket without it is not a ticket nothing was known about.
   */
  recovery?: TicketRecovery;
  invoice: InvoiceDraft;
  source: TicketSource;
  original_stored: boolean;
  ocr_text: string;
  /** Absent on tickets saved before customer profiles existed. */
  customer_profile_id?: number | null;
  /** Absent on tickets saved before truck profiles existed. */
  truck_id?: number | null;
  /** The upload whose tickets share this invoice number. */
  invoice_batch_id?: string;
  /** When the ticket or its invoice was last changed after saving. */
  edited_at?: string;
  /**
   * When somebody checked this ticket's fields against the picture. Absent or
   * null means it is still waiting: photographed at the plant, read, and kept
   * in its date's batch for whoever gets to the invoicing. A driver with one
   * hand on a ticket is not filling in rates, and the ticket must not be lost
   * because of it.
   */
  reviewed_at?: string | null;
  /**
   * When the app approved this ticket on the evidence, with nobody looking:
   * every field read whole or recovered above the bar, from a customer and a
   * job site the workspace has on file. Such a ticket is off the "to check"
   * list as a reviewed one is, and is billed as one; `reviewed_at` stays
   * null, so the record says which of the two it was. Absent on tickets
   * filed before automatic approval existed.
   */
  auto_approved_at?: string | null;
  /**
   * Set when this page's ticket number matched a ticket already on file. It
   * is kept, photograph and all, on no invoice until a person compares the
   * two and says whether it is the same ticket; the history says who said
   * what, and when. Absent on every other ticket.
   */
  duplicate_review?: DuplicateReview;
};
