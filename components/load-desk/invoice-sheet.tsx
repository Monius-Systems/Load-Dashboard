'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { sellerAddressLines, sellerName } from '@/lib/load-desk/business';
import { phoneDisplay } from '@/lib/phone';
import {
  customerNameFor,
  getProfilesSnapshot,
  getServerProfilesSnapshot,
  subscribeProfiles,
} from '@/lib/load-desk/profiles';
import {
  displayDate,
  invoiceDestination,
  invoiceFuel,
  invoiceOrigin,
  invoiceRate,
  invoiceTons,
  lineTotal,
  money,
  nameFit,
} from '@/lib/load-desk/format';
import { unresolvedCritical } from '@/lib/load-desk/recovery';
import type { InvoiceDraft, SavedRecord, Ticket } from '@/lib/load-desk/types';

/**
 * A ticket on the invoice, with the customer profile chosen for it and the
 * record of how its fields were read. The recovery record comes along because
 * a line is printed from the ticket, and a field still waiting on a person is
 * not a value a printed invoice may pass off as one.
 */
export type InvoiceLine = Pick<
  SavedRecord,
  'ticket' | 'customer_profile_id' | 'recovery'
>;

/**
 * What a cell says when the print behind it was never confirmed.
 *
 * Prose keeps whatever fragment printed, so a destination the printer cut off
 * arrives here reading "ARKHAM, IL" and looks exactly like a place. Blanking
 * it would hide that anything was read at all — worse on paper, where nobody
 * can click the field to find out — so the fragment is printed and told on.
 * A number or a date never reaches here at all: those come through as null.
 */
const UNCONFIRMED = ' (unconfirmed)';

const marked = (
  line: InvoiceLine,
  text: string,
  ...fields: (keyof Ticket)[]
): string =>
  text &&
  fields.some((field) => line.recovery?.fields[field]?.status === 'needs_review')
    ? `${text}${UNCONFIRMED}`
    : text;

/**
 * The columns, and the share of the table each one takes.
 *
 * The widths are fixed rather than sized to what is in them, so a column edge
 * falls in the same place on every invoice: two invoices printed a week apart
 * lay their figures out identically, and a reader who knows where the tonnage
 * sits keeps knowing. Each width holds its own heading at the heading size,
 * and the widths of the text columns were set from the longest plant name,
 * delivery address and client name that turn up on a real sheet. A line
 * longer than that is set smaller to fit the column it is given -- the print
 * moves, the grid does not. The shares add up to 100.
 */
const COLUMNS: { name: string; width: number }[] = [
  { name: 'Date', width: 6.8 },
  { name: 'Ticket #', width: 8.4 },
  { name: 'Customer name', width: 17 },
  { name: 'Origin', width: 18.6 },
  { name: 'Destination', width: 21.4 },
  { name: 'Net Tons', width: 6.3 },
  { name: 'Rate', width: 7 },
  { name: 'Fuel Charge', width: 8 },
  { name: 'Total', width: 6.5 },
];
/** The reference invoice has room for 15 lines; longer invoices grow. */
const MIN_ROWS = 15;


/**
 * The width of the page inside its margins, in CSS pixels: US Letter
 * landscape (11 in) less 0.4 in of margin on each side is 10.2 in, or 979px,
 * on screen and on paper alike.
 */
const PAGE_WIDTH = 979;
/**
 * Table width used when measuring. The table fills the page, but measuring
 * against a little less keeps room to spare for a font that comes out
 * slightly wider on the printer than it did in the browser.
 */
const TABLE_WIDTH = 960;
/** Horizontal cell padding plus borders, per column. */
const CELL_CHROME = 12;
const LINE_FONT = 'Arial, Helvetica, sans-serif';
const MAX_LINE_SIZE = 11;
/** Smallest size that stays readable on paper. */
const MIN_LINE_SIZE = 7;
/**
 * How small a single column may be set when its own text will not fit at the
 * readable minimum -- a delivery address twice the length of any other. Only
 * that column steps down this far, and only rather than print over the column
 * edge beside it. The sheet is never scaled as a whole: that would move the
 * invoice number, the date and the company block, which stay put.
 */
const FLOOR_LINE_SIZE = 5;

/**
 * The room each of the two names at the top of the sheet has, and the sizes
 * they may be set at. These mirror the fixed blocks in load-desk.css, which
 * is where the widths themselves are set:
 *
 * - the client's name has what .invoice-details leaves over once the BILL TO
 *   label and the gap after it are taken off;
 * - the company's name has the whole of .invoice-seller.
 *
 * Neither is allowed smaller than the address lines printed under it: a name
 * set smaller than its own street address reads as a mistake rather than as a
 * fit. Below that they wrap instead.
 */
const BILL_TO = {
  room: PAGE_WIDTH * 0.3675 - 88 - 14,
  max: 17,
  min: 13,
  /** .invoice-billto strong is tracked out; letter spacing takes width too. */
  tracking: 0.04,
};
const SELLER = { room: PAGE_WIDTH * 0.35, max: 15, min: 12, tracking: 0 };

/**
 * What a name measures at 100px, letter spacing included -- spacing follows
 * every letter, so it adds `tracking` of the size for each one.
 */
const nameWidth = (
  context: CanvasRenderingContext2D,
  text: string,
  weight: number,
  tracking: number,
) => {
  context.font = `${weight} 100px ${LINE_FONT}`;
  return context.measureText(text).width + tracking * 100 * text.length;
};

/**
 * The ticket-line font size for each column: the largest at which that
 * column's longest value still fits the fixed width the column is given.
 *
 * Every column shares one size, the largest that suits them all, so the lines
 * read as one table rather than nine. A column whose text will not fit even
 * at the readable minimum is the exception, and is set smaller on its own.
 * Text is measured with a canvas, so this also works for the hidden print
 * copy, which is never on screen to be measured any other way.
 */
function lineLayout(rows: string[][]): { size: number; columns: number[] } {
  const fallback = {
    size: MAX_LINE_SIZE,
    columns: COLUMNS.map(() => MAX_LINE_SIZE),
  };
  if (!rows.length || typeof document === 'undefined') return fallback;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return fallback;
  // Measure at 100px and scale; tiny canvas font sizes measure imprecisely.
  context.font = `bold 100px ${LINE_FONT}`;
  const perPixel = COLUMNS.map(
    (_, column) =>
      Math.max(...rows.map((row) => context.measureText(row[column]).width)) /
      100,
  );
  const fits = COLUMNS.map((column, index) => {
    const room = (TABLE_WIDTH * column.width) / 100 - CELL_CHROME;
    for (let size = MAX_LINE_SIZE; size > FLOOR_LINE_SIZE; size -= 0.5) {
      if (perPixel[index] * size <= room) return size;
    }
    return FLOOR_LINE_SIZE;
  });
  const size = Math.max(MIN_LINE_SIZE, Math.min(...fits));
  return { size, columns: fits.map((fit) => Math.min(size, fit)) };
}

/**
 * The size for each of the two names at the top of the sheet, measured the
 * same way the ticket lines are and for the same reason: the blocks they sit
 * in do not move, so the names are what gives.
 */
function nameLayout(billToName: string, sellerName: string) {
  const whole = (spec: typeof BILL_TO) => ({ size: spec.max, wrapped: false });
  const context =
    typeof document === 'undefined'
      ? null
      : document.createElement('canvas').getContext('2d');
  if (!context) return { billTo: whole(BILL_TO), seller: whole(SELLER) };
  const fit = (text: string, spec: typeof BILL_TO, weight: number) =>
    nameFit(
      nameWidth(context, text, weight, spec.tracking),
      spec.room,
      spec.max,
      spec.min,
    );
  return {
    billTo: fit(billToName, BILL_TO, 700),
    seller: fit(sellerName, SELLER, 700),
  };
}

/**
 * Landscape invoice laid out like the supplied A & D Trucking invoice, with
 * one single-line row per ticket. As on the reference, a date is printed only
 * when it changes from the line above.
 */
export default function InvoiceSheet({
  lines: invoiceLines,
  invoice,
}: {
  lines: InvoiceLine[];
  invoice: InvoiceDraft;
}) {
  const { company, customers } = useSyncExternalStore(
    subscribeProfiles,
    getProfilesSnapshot,
    getServerProfilesSnapshot,
  );
  const lines = invoiceLines.map((line) => line.ticket);
  const sellerLines = sellerAddressLines(company);
  const seller = sellerName(company) || 'Set your company name in Account';
  const billTo = invoice.bill_to;
  const names = nameLayout(billTo.name, seller);
  const rows = lines.map((ticket, index) => {
    const date = displayDate(ticket.ticket_date);
    const previous =
      index > 0 ? displayDate(lines[index - 1].ticket_date) : null;
    const line = invoiceLines[index];
    return [
      date === previous ? '' : date,
      ticket.ticket_number ?? '',
      // The customer profile's name, not the name as scanned.
      marked(line, customerNameFor(line, customers), 'customer_name'),
      marked(line, invoiceOrigin(ticket), 'plant_name', 'plant_address'),
      marked(line, invoiceDestination(ticket.project_address), 'project_address'),
      invoiceTons(ticket),
      invoiceRate(ticket),
      invoiceFuel(ticket),
      money(lineTotal(ticket)),
    ];
  });
  const blankRows = Array.from(
    { length: Math.max(0, MIN_ROWS - rows.length) },
    (_, index) => index,
  );
  const totals = lines
    .map(lineTotal)
    .filter((value): value is number => value !== null);
  const invoiceTotal = totals.length
    ? Math.round(totals.reduce((sum, value) => sum + value, 0) * 100) / 100
    : null;
  const needsRate = lines.some((ticket) => lineTotal(ticket) === null);
  const needsConfirmation = invoiceLines.some(
    (line) => line.recovery && unresolvedCritical(line.recovery).length > 0,
  );
  // The truck number comes from the chosen truck profile, not the scan.
  const truckNumber = invoice.truck_number;
  const layout = lineLayout(rows);

  return (
    <article
      className="invoice-sheet"
      aria-label={`Invoice ${invoice.invoice_number}`}
    >
      <div className="invoice-head">
        {/* Invoice details, then Bill To under the truck number, against the
            left margin. The order here is the order they are read in, on
            screen and on paper. */}
        <div className="invoice-details">
          <dl className="invoice-meta">
            <div>
              <dt>INVOICE #</dt>
              <dd
                className="invoice-value"
                data-long={invoice.invoice_number.length > 12}
              >
                {invoice.invoice_number}
              </dd>
            </div>
            <div>
              <dt>INV. DATE:</dt>
              <dd className="invoice-value">
                {displayDate(invoice.invoice_date)}
              </dd>
            </div>
            <div>
              <dt>TRUCK #</dt>
              <dd
                className="invoice-value"
                data-long={truckNumber.length > 12}
              >
                {truckNumber}
              </dd>
            </div>
          </dl>
          <div className="invoice-billto">
            <span>BILL TO:</span>
            <div>
              <strong
                style={{ fontSize: `${names.billTo.size}px` }}
                data-wrapped={names.billTo.wrapped || undefined}
              >
                {billTo.name}
              </strong>
              {billTo.address_lines
                .filter((text) => text.trim())
                .map((text) => (
                  <span key={text}>{text}</span>
                ))}
              {billTo.phone ? <span>Tel: {phoneDisplay(billTo.phone)}</span> : null}
            </div>
          </div>
        </div>
        <div className="invoice-title">
          <p className="invoice-word">INVOICE</p>
          {needsRate ? (
            <p className="invoice-draft">DRAFT - RATE REQUIRED</p>
          ) : null}
        </div>
        <div className="invoice-seller">
          {/* Invoices are always English. An unset company says so plainly
              rather than leaving the line where a name belongs empty. */}
          <strong
            style={{ fontSize: `${names.seller.size}px` }}
            data-wrapped={names.seller.wrapped || undefined}
          >
            {seller}
          </strong>
          {sellerLines.map((text, index) => (
            <span key={`${index}-${text}`}>{text}</span>
          ))}
        </div>
      </div>

      <table
        className="invoice-table"
        style={
          { '--invoice-line-size': `${layout.size}px` } as CSSProperties
        }
      >
        {/* The grid itself, declared once and printed the same every time.
            See COLUMNS. */}
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.name} style={{ width: `${column.width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.name} scope="col">
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${lines[index].ticket_number ?? ''}-${index}`}
              className="invoice-line"
            >
              {row.map((value, column) => (
                <td
                  key={COLUMNS[column].name}
                  // Only a column whose text would not fit at the size the
                  // rest of the table shares carries one of its own; see
                  // lineLayout.
                  style={
                    layout.columns[column] < layout.size
                      ? { fontSize: `${layout.columns[column]}px` }
                      : undefined
                  }
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
          {blankRows.map((row) => (
            <tr key={`blank-${row}`}>
              {COLUMNS.map((column) => (
                <td key={column.name}>{' '}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Under the table rather than beside the word INVOICE: the header's
          middle column is sized to the word itself, and a sentence there
          would widen it and push the word off centre. */}
      {needsConfirmation ? (
        <p className="invoice-unconfirmed">
          One or more tickets on this invoice have fields not yet confirmed
          against the original.
        </p>
      ) : null}
      {invoiceTotal !== null ? (
        <div className="invoice-bottom">
          <dl className="invoice-grand-total">
            <dt>{needsRate ? 'TOTAL (RATED LINES)' : 'TOTAL'}</dt>
            <dd>{money(invoiceTotal)}</dd>
          </dl>
        </div>
      ) : null}
    </article>
  );
}
