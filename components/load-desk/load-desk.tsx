'use client';

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import Image from 'next/image';
import DocumentScanner from '@/components/scanner/document-scanner';
import { useIsPhone } from '@/hooks/use-phone';
import Link from 'next/link';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSearch,
  FileText,
  FileUp,
  MapPin,
  Pencil,
  ReceiptText,
  X,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lens } from '@/components/ui/lens';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import { SelectField } from '@/components/ui/select-field';
import { toast } from '@/components/ui/toast';
import InvoiceDialog, {
  type InvoiceView,
} from '@/components/load-desk/invoice-dialog';
import TicketViewer from '@/components/load-desk/ticket-viewer';
import {
  formatFuel,
  fileSize,
  FUEL_TYPE_LABELS,
  invoiceTons,
  ledgerCsv,
  lineBreakdown,
  lineTotal,
  money,
  pounds,
  RATE_TYPE_LABELS,
  RATE_UNITS,
  sha256Hex,
  todayIso,
} from '@/lib/load-desk/format';
import { extractPages, type ExtractedPage } from '@/lib/load-desk/extract';
import {
  ticketFromExtraction,
  weightDisagreement,
} from '@/lib/load-desk/ticket-extraction';
import { batchPercent } from '@/lib/load-desk/extract-progress';
import { parseTicket } from '@/lib/load-desk/parser';
import { fillFromSameOrder } from '@/lib/load-desk/same-order';
import {
  addCustomerAddress,
  clientForBillTo,
  customerAddresses,
  customerLocationRates,
  rateFor,
  defaultClient,
  defaultTruck,
  getProfilesSnapshot,
  getServerProfilesSnapshot,
  matchCustomer,
  matchCustomerDetailed,
  subscribeProfiles,
  normalizeAddress,
  normalizeName,
  saveInvoiceStart,
  saveProfile,
  truckLabel,
  type ClientProfile,
  type CustomerProfile,
  type TruckProfile,
} from '@/lib/load-desk/profiles';
import { MAX_EDITS, type RecordEdit } from '@/lib/load-desk/record-input';
import {
  blocksSave,
  unresolvedCritical,
  SILENT_FIELDS,
  type FieldResolution,
  type ReviewReason,
  type TicketRecovery,
} from '@/lib/load-desk/recovery';
import {
  applyGroupAnswer,
  dateEdit,
  groupExceptions,
  membersOf,
  type ExceptionGroup,
  type ExceptionType,
} from '@/lib/load-desk/recovery/exceptions';
import { knowledgeOf, ticketOutcome } from '@/lib/load-desk/recovery/outcome';
import { dateMisread, figureMisread } from '@/lib/load-desk/recovery/learned';
import { loadLearnedMisreads, noteMisread } from '@/lib/load-desk/learned-misreads';
import {
  acceptableValue,
  cameraCropFields,
  canLeaveEmpty,
  confirmValue,
  noteSameOrderFill,
  recoverTicket,
  rerecoverSaved,
  unresolvedMessage,
} from '@/lib/load-desk/recovery/queue';
import {
  batchInvoiceFor,
  findInvoiceClash,
  needsReview,
  invoiceGroups,
  invoiceLines,
  invoiceMoveFor,
  batchesByRecency,
  groupByTicketDate,
  openingInvoiceNumber,
  joinsInvoiceFor,
  nextReviewStop,
  numbersByTicketDate,
  numbersForWaitingBatches,
  numbersInDateOrder,
  recordBatch,
  sameTicketOnFile,
  seriesStartFor,
  isPendingInvoiceNumber,
  isUndatedBatch,
  isUnreadableDate,
  pendingInvoiceNumber,
  shownInvoiceNumber,
  UNDATED_BATCH,
  stepReviewStop,
  ticketDateValue,
  ticketDay,
  type InvoiceMove,
  type ReviewStop,
} from '@/lib/load-desk/records';
import {
  claimFinalize,
  completeSession,
  extracted,
  noteTicket,
  openSession,
  releaseFinalize,
  type UploadSession,
} from '@/lib/load-desk/upload-session';
import { SAMPLE_TICKET } from '@/lib/load-desk/samples';
import { PHONE_MASK, phoneDisplay, phoneEdit } from '@/lib/phone';
import {
  clearLocalRecords,
  getRecordsSnapshot,
  getServerRecordsSnapshot,
  loadStoredOriginal,
  saveRecord,
  subscribeRecords,
  reorderInvoicesByDate,
  updateSavedRecords,
} from '@/lib/load-desk/storage';
import {
  emptyTicket,
  FUEL_TYPES,
  fuelTypeOf,
  isNumberField,
  RATE_TYPES,
  rateTypeOf,
  type BillTo,
  type InvoiceDraft,
  type NumberField,
  type QueueItem,
  type SavedRecord,
  type SourceKind,
  type TextField,
  type Ticket,
} from '@/lib/load-desk/types';
import { validateTicket, WEIGHT_TOLERANCE_LB } from '@/lib/load-desk/validate';
import {
  deskSnapshot,
  serverDeskSnapshot,
  setDeskField,
  subscribeDesk,
  type DeskSession,
} from '@/lib/load-desk/desk-session';
import {
  awaitsDuplicateReview,
  DUPLICATE_BATCH,
  DUPLICATE_INVOICE_NUMBER,
  suspectDuplicate,
} from '@/lib/load-desk/duplicates';
import DuplicateReviewPanel from '@/components/load-desk/duplicate-review';
import {
  receiptCounts,
  receiptLines,
  receiptTally,
  type ReceiptEntry,
  type ReceiptOutcome,
  type UploadReceipt,
} from '@/lib/load-desk/upload-receipt';
import type { Translator } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED_NAME = /\.(pdf|png|jpe?g|tiff?|webp|txt)$/i;
const ACCEPT_ATTRIBUTE = '.pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,.txt';

type Entry = { blob: Blob; name: string };
type FieldDef = {
  name: TextField | NumberField;
  label: string;
  span?: 2;
  type?: 'date' | 'time';
  step?: string;
  required?: boolean;
  /**
   * The run of fields this one opens, on a phone. A step of seven boxes reads
   * as a list to get to the end of; the same seven under two short headings
   * read as two things to check. Only the phone shows them — a wide screen has
   * the section headings and the room to lay the fields out in.
   */
  group?: string;
};

const TICKET_FIELDS: FieldDef[] = [
  { name: 'ticket_number', label: 'Ticket / BOL', required: true, group: 'Ticket' },
  { name: 'ticket_date', label: 'Date', type: 'date', required: true },
  { name: 'time_in', label: 'Time in', type: 'time' },
  { name: 'time_out', label: 'Time out', type: 'time' },
  { name: 'plant_code', label: 'Plant code', group: 'Plant' },
  { name: 'plant_name', label: 'Plant name', span: 2 },
  { name: 'dispatch_number', label: 'Dispatch' },
];
const JOB_FIELDS: FieldDef[] = [
  { name: 'customer_id', label: 'Customer ID', group: 'Customer' },
  { name: 'customer_name', label: 'Customer name', span: 2, required: true },
  { name: 'order_number', label: 'Order number' },
  { name: 'project_name', label: 'Project', span: 2, group: 'Job' },
  { name: 'project_address', label: 'Destination address', span: 2 },
  { name: 'po_number', label: 'PO' },
  { name: 'product_code', label: 'Product code', group: 'Material' },
  { name: 'product_description', label: 'Product description', span: 2 },
];
const WEIGHT_FIELDS: FieldDef[] = [
  { name: 'gross_lb', label: 'Gross pounds' },
  { name: 'tare_lb', label: 'Tare pounds' },
  { name: 'net_lb', label: 'Net pounds', required: true },
  { name: 'net_tons', label: 'Net tons', step: '0.01' },
];
const HAULING_FIELDS: FieldDef[] = [
  { name: 'carrier_id', label: 'Carrier ID' },
  { name: 'carrier_name', label: 'Carrier name', span: 2 },
  { name: 'vehicle_id', label: 'Vehicle' },
];

/**
 * Pixels along the long edge, below which a ticket page cannot be read. A
 * letter page at 1600px is about 145 dots per inch, which puts a capital in
 * the 10pt field type around 12 pixels tall — Tesseract's floor, and that is
 * before the page is photographed at an angle. A copy shared through a chat
 * app or saved from a screenshot is routinely half of this.
 */
const MIN_READABLE_EDGE = 1600;

/** The long edge of an image blob, or null when the browser cannot decode it. */
async function imageEdge(blob: Blob): Promise<number | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const edge = Math.max(bitmap.width, bitmap.height);
    bitmap.close();
    return edge;
  } catch {
    // PDFs and anything else the browser will not decode as an image.
    return null;
  }
}

const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

/** The same file picked or dropped twice is only added once. */
const fileKey = (file: File) =>
  `${file.name}|${file.size}|${file.lastModified}`;

function guessType(name: string, type: string) {
  if (type) return type;
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.txt$/i.test(name)) return 'text/plain';
  if (/\.tiff?$/i.test(name)) return 'image/tiff';
  return 'application/octet-stream';
}

/**
 * Invoice details for a new upload. Its number is set when the upload is
 * queued, and its truck number comes from the chosen truck profile.
 */
/** Bill-to details of a client profile, as printed on an invoice. */
const clientBillTo = (client: ClientProfile): BillTo => ({
  name: client.name,
  address_lines: [client.address_lines[0], client.address_lines[1]],
  phone: client.phone,
});

/** Bill to client choices besides the client profiles themselves. */
const NO_CLIENT = '';
/** "No truck profile" chosen on purpose, as distinct from nothing chosen yet. */
const NO_TRUCK = '__no-truck';
const NEW_CLIENT = '__new-client';
/** How many stored pictures are fetched at once when an invoice is opened for review. */
const PICTURE_LANES = 3;
/** How many batches Load Desk lists: the most recently added to. */
const RECENT_BATCHES = 3;
const NEW_CUSTOMER = '__new-customer';
/** The panel answer that says a job site is not to be saved onto the customer. */
const SAVE_ADDRESS = '__save-address';

type NewClientDraft = {
  name: string;
  phone: string;
  street: string;
  city: string;
  error: string | null;
  saving: boolean;
};

/** A customer being created from a scanned ticket, its name open to edit. */
type NewCustomerDraft = {
  /** The queue item it was opened for; the form shows only on that ticket. */
  itemId: string;
  name: string;
  error: string | null;
  saving: boolean;
};

/** What each kind of open question is called on the screen. */
const EXCEPTION_TITLES: Record<ExceptionType, string> = {
  NEW_CUSTOMER: 'New customer',
  NEW_LOCATION: 'New job site',
  NEW_PROJECT: 'Project name needed',
  NEW_CUSTOMER_PROJECT_COMBINATION: 'New job for this customer',
  AMBIGUOUS_LOCATION: 'Which job site?',
  AMBIGUOUS_CUSTOMER: 'Which customer?',
  CLIPPED_TEXT_RECOVERABLE: 'Print cut off',
  CONFLICTING_GROUP_DATA: 'Readings disagree',
  INDIVIDUAL_CRITICAL_FIELD: 'This ticket needs a look',
};

/** What a field the group asks about is called beside its box. */
const ASK_LABELS: Partial<Record<keyof Ticket, string>> = {
  ticket_number: 'Ticket / BOL',
  ticket_date: 'Date',
  gross_lb: 'Gross pounds',
  tare_lb: 'Tare pounds',
  net_lb: 'Net pounds',
  net_tons: 'Net tons',
  customer_name: 'Customer',
  customer_id: 'Customer ID',
  project_name: 'Project',
  project_address: 'Job site / destination',
  plant_name: 'Plant',
  plant_address: 'Plant address',
  product_code: 'Product code',
  product_description: 'Product',
  carrier_name: 'Carrier',
  vehicle_id: 'Vehicle',
  order_number: 'Order number',
  po_number: 'PO',
};

/**
 * An invoice is dated by its ticket. Always: whatever date is read off the
 * ticket, or typed onto it afterwards, is the date of the invoice it goes on,
 * and there is no way to set one that differs. It is applied wherever an item
 * is built, filed or saved rather than trusted to the screen, because a ticket
 * is now filed into its batch the moment it is read — before anyone has looked
 * at it — and what was filed then carried the day it was photographed.
 *
 * The only invoice that is not dated this way is one whose ticket has no day
 * anyone can read — nothing printed where the date should be, or a date the
 * scan made a nonsense of. There is nothing to go by, so the draft's own date
 * stands until the ticket's date is entered, and entering it moves the
 * invoice.
 */
function invoiceDated(item: QueueItem): QueueItem {
  const date = ticketDay(item.ticket.ticket_date);
  if (!date || date === item.invoice.invoice_date) return item;
  return { ...item, invoice: { ...item.invoice, invoice_date: date } };
}

function defaultInvoice(): InvoiceDraft {
  return {
    invoice_number: '',
    invoice_date: todayIso(),
    return_date: '',
    truck_number: '',
    // Filled from the client chosen for the invoice.
    bill_to: { name: '', address_lines: ['', ''], phone: '' },
  };
}

type ProfileContext = {
  customers: CustomerProfile[];
  truck: TruckProfile | null;
  /**
   * Who a new invoice is billed to: the default client under Account, or the
   * client the last invoice went to. It has to be here, on the item as it is
   * built, because a ticket is filed the moment it is read — before the
   * upload's grouping, which used to be the only place the client was put on.
   * A record filed with an empty bill-to is a record somebody has to stop
   * and pick a client for, on every ticket, whatever default they had set.
   */
  billTo: BillTo | null;
};

/** Links a queue item to a customer profile and fills its rate and rate type. */
/**
 * Links a queue item to a customer profile and rates the ticket the way that
 * customer is charged where this load went: the site's own rate where the
 * delivery address has one, the customer's usual rate otherwise. A customer
 * with no rate leaves whatever is on the ticket.
 */
function applyCustomer(
  item: QueueItem,
  customer: CustomerProfile | null,
): QueueItem {
  if (!customer) return { ...item, customer_profile_id: null };
  const rated = rateFor(customer, item.ticket.project_address);
  return {
    ...item,
    customer_profile_id: customer.id,
    ticket: {
      ...item.ticket,
      rate: rated.flat_rate ?? item.ticket.rate,
      rate_type: rated.flat_rate !== null ? rated.rate_type : item.ticket.rate_type,
      fuel_charge: rated.fuel_charge ?? item.ticket.fuel_charge,
      fuel_type: rated.fuel_charge !== null ? rated.fuel_type : item.ticket.fuel_type,
    },
  };
}

/** Links a queue item to a truck profile; its number goes on the invoice. */
function applyTruck(item: QueueItem, truck: TruckProfile | null): QueueItem {
  return truck
    ? {
        ...item,
        truck_id: truck.id,
        invoice: { ...item.invoice, truck_number: truck.truck_number },
      }
    : { ...item, truck_id: null, invoice: { ...item.invoice, truck_number: '' } };
}

async function buildQueueItem(
  entry: Entry,
  kind: SourceKind,
  profiles: ProfileContext,
  extracted?: ExtractedPage & { total: number },
): Promise<QueueItem> {
  const type = guessType(entry.name, entry.blob.type);
  const sha256 = await sha256Hex(entry.blob);
  let ocrText = extracted?.text ?? '';
  let note =
    'Extracted locally. Review the fields against the original before saving.';
  if (!extracted && sha256 === SAMPLE_TICKET.sha256) {
    ocrText = SAMPLE_TICKET.ocrText;
    note =
      'Matched the supplied Heidelberg sample by SHA-256. This is its saved OCR text, scan errors included.';
  } else if (type === 'text/plain') {
    ocrText = await entry.blob.text();
    note = 'Parsed the ticket text in this file.';
  }
  let ticket = emptyTicket();
  let noteProblem = false;
  let recovery: TicketRecovery | undefined;
  if (extracted?.extracted) {
    // Read by the model behind /api/extract: its thirteen fields become this
    // ticket directly. Everything it was not asked for stays blank and is
    // filled in during review, as an unreadable field always has been.
    ticket = ticketFromExtraction(extracted.extracted);
    if (extracted.observed) {
      // The same read, with the damage still in it. What the reader saw whole
      // is already on the ticket above; this is where a field it saw only
      // part of gets its hearing — against the vendor's own layout, the
      // workspace's records and the rest of this upload — instead of arriving
      // as a blank nobody can account for.
      //
      // The customer is matched on the exact-only ticket, because the
      // evidence the workspace offers is scoped to whose ticket this is and
      // a name the app completed itself would scope it to a guess. The
      // profile is matched again below, off the recovered ticket, so a name
      // that was recovered still finds its customer.
      const resolved = recoverTicket({
        observed: extracted.observed,
        paper: extracted.paper,
        extracted: ticket,
        records: getRecordsSnapshot().records,
        profiles: getProfilesSnapshot(),
        customer: matchCustomer(profiles.customers, ticket),
      });
      ticket = resolved.ticket;
      recovery = resolved.recovery;
    }
    note = 'Read from the ticket image. Check the fields against the original before saving.';
    const disagreement = weightDisagreement(extracted.extracted);
    const waiting = recovery ? unresolvedCritical(recovery) : [];
    const cropped = recovery ? cameraCropFields(recovery) : [];
    if (disagreement) {
      note = disagreement;
      noteProblem = true;
    } else if (!ticket.ticket_number && !waiting.length) {
      note = 'No ticket number could be read from this page. Check the original, or enter the fields by hand.';
      noteProblem = true;
    }
    // The photograph is the one cause the person holding the phone can fix,
    // so it is said last and said as a problem. A field waiting on the
    // original is not a failure — the ticket was read, and somebody has to
    // look at one box of it — so it says what to do without the warning.
    if (cropped.length) {
      note =
        'The sheet ran off the photograph, so part of this ticket was never in the picture. Take the picture again with the whole ticket inside the frame.';
      noteProblem = true;
    } else if (waiting.length && !disagreement) {
      note = `${waiting.length} ${waiting.length === 1 ? 'field needs' : 'fields need'} confirmation against the original before this ticket can be invoiced.`;
      noteProblem = false;
    }
  } else if (ocrText) {
    const parsed = parseTicket(ocrText);
    ticket = parsed.ticket;
    if (parsed.error) { note = parsed.error; noteProblem = true; }
  } else if (extracted) {
    // The reader ran and came back with nothing at all: a blank page, a photo
    // too dark or blurred to make out, or a scan of a ticket face-down.
    note = 'Nothing could be read from this page. Check the original, or enter the fields by hand.';
    noteProblem = true;
  }
  // No ticket number means nothing useful was read. If the picture is simply
  // too small to have print in it, say so rather than leaving it a mystery:
  // it is the one cause the person holding the phone can do something about.
  if (!ticket.ticket_number && type !== 'text/plain') {
    const edge = await imageEdge(entry.blob);
    if (edge !== null && edge < MIN_READABLE_EDGE) {
      note = `This picture is only ${edge} pixels on its long edge, too small for the print on a ticket to be read. Photograph the ticket again with the phone, or upload the original file rather than a screenshot or a copy shared through a chat app.`;
      noteProblem = true;
    }
  }
  const item: QueueItem = {
    id: makeId(),
    source: {
      file_name:
        extracted && extracted.total > 1
          ? `${entry.name} · page ${extracted.page}`
          : entry.name,
      sha256,
      page: extracted?.page,
      size: entry.blob.size,
      type,
      kind,
    },
    original: entry.blob,
    preview_url:
      URL.createObjectURL(entry.blob) +
      (extracted ? `#page=${extracted.page}` : ''),
    ocr_text: ocrText,
    note,
    note_problem: noteProblem,
    ticket,
    // Absent for anything the reader did not observe — a text file, the
    // sample, a scan reopened from the records — and the review screen then
    // shows exactly what it always showed.
    ...(extracted?.observed ? { observed: extracted.observed } : {}),
    ...(recovery ? { recovery } : {}),
    invoice: {
      ...defaultInvoice(),
      ...(profiles.billTo ? { bill_to: { ...profiles.billTo } } : {}),
    },
    preview_status: 'ready',
    saved_record_id: null,
    customer_profile_id: null,
    truck_id: null,
    // Assigned when the whole upload has been extracted.
    batch_id: '',
    baseline: null,
    from_saved: false,
  };
  return invoiceDated(
    applyTruck(
      applyCustomer(item, matchCustomer(profiles.customers, ticket)),
      profiles.truck,
    ),
  );
}

/**
 * Keeps a ticket the moment it has been read, on the invoice for its own date.
 *
 * A driver photographs a ticket at the plant with one hand and closes the app;
 * nobody is entering rates on a weighbridge. Until now the ticket lived in the
 * tab and a reload threw it away. Now the picture and the fields are saved
 * straight into that date's batch, unreviewed, and whoever does the invoicing
 * picks the batch up later — on the phone, or on the desk.
 *
 * Returns the item as a saved one, and the batch if this ticket opened one —
 * the number a new batch claims here is only the next one free as the page is
 * read, so those are the batches whose numbers go into date order once the
 * whole upload is in. A ticket joining a batch already on file reports none:
 * that invoice is numbered already and does not move.
 *
 * If it cannot be filed — no signal in a yard, a session that has ended — the
 * item is handed back exactly as it was, so it stays in the queue to be saved
 * by hand rather than being lost.
 *
 * A page whose ticket number is already on file is kept too — photograph,
 * fields and all — but held off every invoice as a suspected duplicate, and
 * comes back as `suspected` rather than as an item for the queue: what it
 * needs is the two pictures side by side (see DuplicateReviewPanel), not the
 * review screen. It used to be turned away unsaved, its photograph with it,
 * and a different ticket whose number was read wrong could never be found.
 * Only the very same file, page for page, is not kept again — it is stored
 * already, as `sameFile`.
 */
async function fileInBatch(
  original: QueueItem,
  records: SavedRecord[],
  held: SavedRecord[],
): Promise<{
  item: QueueItem;
  error: string | null;
  opened: string | null;
  sameFile: SavedRecord | null;
  suspected: { record: SavedRecord; matched: SavedRecord } | null;
}> {
  const item = invoiceDated(original);
  const none = { opened: null, sameFile: null, suspected: null };
  const sameFile = sameFileOnFile([...records, ...held], item.source);
  if (sameFile) return { ...none, item, error: null, sameFile };
  const matched = sameTicketOnFile(records, item.ticket);
  if (matched) {
    const result = await saveSuspectedDuplicate(item, matched);
    return 'error' in result
      ? { ...none, item: suspectedNote(item, matched), error: result.error }
      : { ...none, item, error: null, suspected: { record: result.record, matched } };
  }
  const batch = batchInvoiceFor(records, item.ticket.ticket_date);
  const result = await saveRecord(
    {
      saved_at: new Date().toISOString(),
      ticket: item.ticket,
      // Filed with the record of how it was read. A ticket nobody has checked
      // yet is exactly the one whose recovered fields have to survive the
      // reload, or whoever picks the batch up later sees the values with
      // nothing to say where they came from.
      ...(item.recovery ? { recovery: item.recovery } : {}),
      invoice: { ...item.invoice, invoice_number: batch.invoice_number },
      source: item.source,
      ocr_text: item.ocr_text,
      customer_profile_id: item.customer_profile_id,
      truck_id: item.truck_id,
      invoice_batch_id: batch.batch_id,
      // Nobody has checked it yet; that is the whole point of filing it here.
      reviewed_at: null,
    },
    item.original,
  );
  if ('error' in result) return { ...none, item, error: result.error };
  const filed: QueueItem = {
    ...item,
    invoice: result.record.invoice,
    batch_id: batch.batch_id,
    saved_record_id: result.record.id,
    from_saved: true,
    baseline: null,
    note: 'Kept in this date’s batch. Check the fields against the picture when you invoice it.',
  };
  // What was filed is what is on the screen, so that is the mark to measure
  // later edits against. Without it nothing typed afterwards reads as a change
  // and the ticket sits on "Saved" with the button disabled, unsaveable.
  return {
    ...none,
    item: { ...filed, baseline: editKey(filed) },
    error: null,
    opened: batch.opened ? batch.batch_id : null,
  };
}

/** The saved record that is this very file and page, or undefined. */
const sameFileOnFile = (records: SavedRecord[], source: QueueItem['source']) =>
  records.find(
    (record) =>
      record.source.sha256 === source.sha256 &&
      (record.source.page ?? 1) === (source.page ?? 1),
  );

/**
 * Saves a page as a suspected duplicate of `matched`: photograph stored,
 * record saved, held in the duplicates batch on no invoice, its review open.
 */
function saveSuspectedDuplicate(item: QueueItem, matched: SavedRecord) {
  return saveRecord(
    {
      saved_at: new Date().toISOString(),
      ticket: item.ticket,
      ...(item.recovery ? { recovery: item.recovery } : {}),
      invoice: { ...item.invoice, invoice_number: DUPLICATE_INVOICE_NUMBER },
      source: item.source,
      ocr_text: item.ocr_text,
      customer_profile_id: item.customer_profile_id,
      truck_id: item.truck_id,
      invoice_batch_id: DUPLICATE_BATCH,
      reviewed_at: null,
      duplicate_review: suspectDuplicate(
        matched,
        item.ticket.ticket_number ?? '',
        new Date().toISOString(),
      ),
    },
    item.original,
  );
}

/** A suspected duplicate that could not be saved yet, as the queue shows it. */
const suspectedNote = (item: QueueItem, matched: SavedRecord): QueueItem => ({
  ...item,
  note: `Possible duplicate of record ${matched.id} (ticket ${matched.ticket.ticket_number}). It could not be saved yet; saving it holds it for a side-by-side check, on no invoice.`,
  note_problem: true,
});

/**
 * The review as the navigation reads it: every queued ticket, the invoice it is
 * on and whether it has been checked.
 *
 * Being checked is the stored record's own `reviewed_at` and nothing else, so it
 * is read off the records rather than the queue; a ticket not saved at all is
 * waiting by definition, because saving it after looking at it is the checking.
 * The invoice is the ticket's batch, which is what makes tickets one invoice
 * here, and the day is the one its invoice is dated — the day on the ticket,
 * which is the same thing (see invoice-dates.ts) and is what orders the invoices
 * among themselves.
 */
const reviewStops = (items: QueueItem[], saved: SavedRecord[]): ReviewStop[] => {
  // Worked out once for the whole queue rather than per ticket: this runs on
  // every render of the page, and a workspace's ledger is long.
  const checked = new Set(
    saved.filter((record) => !needsReview(record)).map((record) => record.id),
  );
  return items.map((item) => ({
    invoice: item.batch_id,
    day: ticketDateValue(item.invoice.invoice_date || item.ticket.ticket_date),
    reviewed: item.saved_record_id !== null && checked.has(item.saved_record_id),
  }));
};

/** The fields a person edits, compared to spot unsaved changes. */
const editKey = (edit: Omit<RecordEdit, 'id'>) =>
  JSON.stringify([
    edit.ticket,
    edit.invoice,
    edit.ocr_text,
    edit.customer_profile_id,
    edit.truck_id,
    // Accepting a candidate for a field that already carried it changes no
    // value on the ticket and is still the whole point of the review: it is
    // the difference between a figure the app worked out and a figure
    // somebody stands behind. Unsaved until it is saved, like anything else.
    edit.recovery ?? null,
  ]);

/** A saved ticket whose fields differ from what is saved. */
const hasChanges = (item: QueueItem) =>
  item.baseline !== null && editKey(item) !== item.baseline;

/**
 * Which fields the same-order fill put a value into.
 *
 * Read off the two tickets rather than off the labels `fillFromSameOrder`
 * reports, because the labels are English for a sentence in the note and the
 * recovery record is keyed by field. Taking the difference also keeps this
 * honest if the fill ever learns a new field: nothing here has to be told.
 */
const sameOrderFilled = (before: Ticket, after: Ticket): (keyof Ticket)[] =>
  (Object.keys(after) as (keyof Ticket)[]).filter(
    (field) => before[field] === null && after[field] !== null,
  );

/**
 * The ticket of this upload the fill took those values from.
 *
 * The fill works field by field and takes each from the first ticket of the
 * same order that has it, so in principle two pages could have contributed;
 * the one named here is the first that carries what was filled in, which is
 * that ticket in every real upload and a fair thing to point a reviewer at
 * in the rest. When none can be identified the note says "another ticket"
 * rather than naming the wrong one.
 */
function sameOrderSource(added: QueueItem[], item: QueueItem, filled: Ticket): Ticket {
  const order = item.ticket.order_number?.trim();
  const fields = sameOrderFilled(item.ticket, filled);
  const source = added.find(
    (other) =>
      other !== item &&
      other.ticket.order_number?.trim() === order &&
      fields.some((field) => other.ticket[field] === filled[field]),
  );
  return source?.ticket ?? { ...filled, ticket_number: null };
}

function editOf(source: QueueItem, movedTo?: string): RecordEdit {
  const item = invoiceDated(source);
  return {
    id: item.saved_record_id!,
    ticket: item.ticket,
    ...(item.recovery ? { recovery: item.recovery } : {}),
    invoice: {
      ...item.invoice,
      invoice_number: item.invoice.invoice_number.trim(),
    },
    ocr_text: item.ocr_text,
    customer_profile_id: item.customer_profile_id,
    truck_id: item.truck_id,
    ...(movedTo ? { invoice_batch_id: movedTo } : {}),
  };
}

/** A saved ticket reopened for editing. Its stored scan loads separately. */
function itemFromRecord(record: SavedRecord, batchId: string): QueueItem {
  const savedOn = new Date(record.edited_at ?? record.saved_at).toLocaleDateString(
    'en-US',
  );
  // The fields still waiting on a person, looked at again under today's
  // rules and today's memory (see `rerecoverSaved`): a ticket filed with a
  // verdict the reader has since been corrected on opens with the corrected
  // one, as an unsaved change, rather than with an issue nobody can act on.
  const profiles = getProfilesSnapshot();
  const reconsidered = record.recovery
    ? rerecoverSaved({
        ticket: record.ticket,
        recovery: record.recovery,
        records: getRecordsSnapshot().records,
        profiles,
        customer:
          profiles.customers.find((known) => known.id === record.customer_profile_id) ??
          matchCustomer(profiles.customers, record.ticket),
      })
    : { ticket: record.ticket, recovery: undefined };
  const item: QueueItem = {
    id: makeId(),
    source: record.source,
    original: new Blob(),
    preview_url: '',
    preview_status: 'loading',
    ocr_text: record.ocr_text,
    note: `${record.edited_at ? 'Last edited' : 'Saved'} ${savedOn}. Change any field, then save the changes.`,
    ticket: reconsidered.ticket,
    // Its stored record of how it was read, and nothing else: the
    // observation belonged to the read and was never saved, so a reopened
    // ticket shows what was decided about each field without pretending the
    // paper is in front of it again.
    ...(reconsidered.recovery ? { recovery: reconsidered.recovery } : {}),
    invoice: record.invoice,
    saved_record_id: record.id,
    customer_profile_id: record.customer_profile_id ?? null,
    truck_id: record.truck_id ?? null,
    batch_id: batchId,
    baseline: null,
    from_saved: true,
  };
  // The baseline is what is stored, and the date and the reconsidered fields
  // are corrected after it: a record filed before a rule was enforced opens
  // with the corrected value and says so as an unsaved change, rather than
  // keeping the wrong one quietly.
  const stored: QueueItem = {
    ...item,
    ticket: record.ticket,
    ...(record.recovery ? { recovery: record.recovery } : {}),
  };
  return invoiceDated({ ...item, baseline: editKey(stored) });
}

function weightCheck(ticket: Ticket, t: Translator['t']) {
  const { gross_lb, tare_lb, net_lb } = ticket;
  if (gross_lb === null || tare_lb === null || net_lb === null) {
    return {
      tone: 'neutral',
      text: t('Enter gross, tare and net pounds to check the balance.'),
    };
  }
  const difference = Math.abs(gross_lb - tare_lb - net_lb);
  return difference <= WEIGHT_TOLERANCE_LB
    ? {
        tone: 'good',
        text: t('Gross minus tare matches net within {difference} lb.', {
          difference: difference.toLocaleString('en-US'),
        }),
      }
    : {
        tone: 'bad',
        text: t('Gross minus tare is {weight} lb, {difference} lb off the net weight.', {
          weight: (gross_lb - tare_lb).toLocaleString('en-US'),
          difference: difference.toLocaleString('en-US'),
        }),
      };
}

function SourcePreview({ item }: { item: QueueItem }) {
  const { t } = useT();
  const { type, file_name } = item.source;
  if (type === 'text/plain') {
    return (
      <div className="ld-preview ld-preview-empty">
        {t('Text file. Its contents are under Ticket text.')}
      </div>
    );
  }
  if (item.preview_status === 'loading') {
    return (
      <div className="ld-preview ld-preview-empty">
        {t('Loading the stored original…')}
      </div>
    );
  }
  if (item.preview_status === 'missing') {
    return (
      <div className="ld-preview ld-preview-empty">
        {t('The original is not stored for this ticket.')}
      </div>
    );
  }
  if (type === 'application/pdf') {
    return (
      <div className="ld-preview">
        <iframe src={item.preview_url} title={t('Original: {name}', { name: file_name })} />
      </div>
    );
  }
  if (/^image\/(png|jpe?g|webp|gif)$/.test(type)) {
    return (
      <div className="ld-preview">
        <Image
          unoptimized
          src={item.preview_url}
          width={760}
          height={980}
          alt={t('Original ticket {name}', { name: file_name })}
        />
      </div>
    );
  }
  return (
    <div className="ld-preview ld-preview-empty">
      {t('This browser cannot preview {name}. It is still stored with the record.', {
        name: file_name,
      })}
    </div>
  );
}

const RECEIPT_OUTCOMES: Record<ReceiptOutcome, string> = {
  filed: 'Filed',
  undated: 'Waiting for a date',
  suspected: 'Possible duplicate',
  duplicate: 'Same ticket',
  same_file: 'File already saved',
  unsaved: 'Not saved',
  failed: 'Not read',
  gone: 'Deleted since',
};

/**
 * Where each page of the last upload went, a row each: the file, the ticket
 * read off it, the record it is and the invoice that record is on — or why it
 * is on none. Every page is a row, so the rows add up to what was uploaded
 * and nothing is left to be found by counting an invoice.
 */
function UploadReceiptList({
  receipt,
  records,
  onOpenRecord,
  onDismiss,
}: {
  receipt: UploadReceipt;
  records: SavedRecord[];
  onOpenRecord: (id: number) => void;
  onDismiss: () => void;
}) {
  const { t, plural } = useT();
  const lines = receiptLines(receipt, records);
  if (!lines.length) return null;
  const counts = receiptCounts(lines);
  const tally = [
    counts.saved ? t('{tickets} filed', { tickets: plural(counts.saved, 'ticket') }) : '',
    counts.suspected.length
      ? t('{tickets} held as possible duplicates', { tickets: plural(counts.suspected.length, 'ticket') })
      : '',
    counts.duplicates.length
      ? t('{tickets} confirmed duplicates', { tickets: plural(counts.duplicates.length, 'ticket') })
      : '',
    counts.sameFile.length
      ? t('{files} already saved', { files: plural(counts.sameFile.length, 'file') })
      : '',
    counts.unsaved ? t('{tickets} not saved', { tickets: plural(counts.unsaved, 'ticket') }) : '',
    counts.failed ? t('{files} not read', { files: plural(counts.failed, 'file') }) : '',
    counts.gone ? t('{tickets} deleted since', { tickets: plural(counts.gone, 'ticket') }) : '',
  ].filter(Boolean);
  const invoiceOf = (line: (typeof lines)[number]) => {
    if (line.invoice) {
      return (
        <>
          {t('Invoice {number}', { number: line.invoice })}
          {line.outcome === 'filed' ? (
            <small>{line.newInvoice ? t('new') : t('already on file')}</small>
          ) : null}
        </>
      );
    }
    if (line.outcome === 'undated') return t('None until the date is entered');
    if (line.outcome === 'suspected') return t('None until it is compared');
    if (line.outcome === 'failed') return t('Back with the files waiting');
    if (line.outcome === 'unsaved') return t('Waiting in the queue to be saved');
    if (line.outcome === 'gone') return '—';
    return t('No invoice yet');
  };
  return (
    <section className="ld-receipt" aria-labelledby="ld-receipt-title">
      <div className="ld-receipt-head">
        <div>
          <h3 id="ld-receipt-title">{t('Where each ticket went')}</h3>
          <p>
            {[t('{pages} uploaded', { pages: plural(lines.length, 'page') }), ...tally].join(' · ')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          aria-label={t('Dismiss')}
        >
          <X />
        </Button>
      </div>
      <table className="ld-receipt-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">{t('File')}</th>
            <th scope="col">{t('Ticket')}</th>
            <th scope="col">{t('Result')}</th>
            <th scope="col">{t('Record')}</th>
            <th scope="col">{t('Invoice')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${index}-${line.file}`} data-outcome={line.outcome}>
              <td data-label="#">{index + 1}</td>
              <td data-label={t('File')} className="ld-receipt-file">
                {line.file}
              </td>
              <td data-label={t('Ticket')}>{line.ticketNumber ?? t('unnumbered')}</td>
              <td data-label={t('Result')}>
                <strong>{t(RECEIPT_OUTCOMES[line.outcome])}</strong>
                {line.outcome === 'suspected' ? (
                  <small>
                    {t('Same ticket number as record {id}. Kept and held off every invoice until you compare them.', {
                      id: line.matchedId!,
                    })}
                  </small>
                ) : line.outcome === 'duplicate' ? (
                  <small>
                    {t('Checked: the same ticket as record {id}. Kept, never billed.', {
                      id: line.matchedId!,
                    })}
                  </small>
                ) : line.outcome === 'same_file' ? (
                  <small>{t('This very file is saved already.')}</small>
                ) : line.detail ? (
                  <small>{line.detail}</small>
                ) : null}
              </td>
              <td data-label={t('Record')}>
                {line.recordId !== null && line.outcome !== 'gone' ? (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() => onOpenRecord(line.recordId!)}
                  >
                    {t('Record {id}', { id: line.recordId })}
                  </Button>
                ) : line.recordId !== null ? (
                  t('Record {id}', { id: line.recordId })
                ) : (
                  '—'
                )}
              </td>
              <td data-label={t('Invoice')}>{invoiceOf(line)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function LoadDesk() {
  const { t, plural, date } = useT();
  const store = useSyncExternalStore(
    subscribeRecords,
    getRecordsSnapshot,
    getServerRecordsSnapshot,
  );
  const records = store.records;
  // Suspected duplicates, held off every invoice: the ones still waiting for
  // the side-by-side check, and those already settled as the same ticket.
  const held = store.held;
  const profileStore = useSyncExternalStore(
    subscribeProfiles,
    getProfilesSnapshot,
    getServerProfilesSnapshot,
  );
  const { customers, trucks, clients } = profileStore;

  const fieldId = useId();
  // The queue, the files waiting and the extraction live outside React, so
  // opening another page and coming back does not throw the work away, and an
  // extraction started here keeps running while another page is open.
  const desk = useSyncExternalStore(subscribeDesk, deskSnapshot, serverDeskSnapshot);
  const {
    queue,
    activeIndex,
    pending,
    busy,
    uploadStatus,
    uploadReceipt,
    extraction,
    saveStatus,
    scannerOpen,
    editRequest,
    truckChoice,
    addingTo,
  } = desk;
  // The line under the upload button. After an upload it is the receipt's
  // tally as things stand now, then whatever was true only of that moment.
  const receiptNow = useMemo(
    () => (uploadReceipt ? receiptLines(uploadReceipt, [...records, ...held]) : null),
    [uploadReceipt, records, held],
  );
  const uploadLine =
    uploadStatus?.live && receiptNow
      ? [...receiptTally(receiptNow, { t, plural }), uploadStatus.message].filter(Boolean).join(' · ') ||
        t('No tickets were added.')
      : uploadStatus?.message;

  /**
   * What the workspace knows, and what of the filed tickets it does not.
   *
   * Worked out from the records and profiles the page already holds — in the
   * browser, never on the server — and only over the tickets nobody and
   * nothing has settled, which is a short list. A ticket the evidence
   * settles is approved below without a look; the rest are sorted into the
   * questions they raise, one per job, and asked once.
   */
  const knowledge = useMemo(
    () => knowledgeOf(records, { customers, trucks, clients }),
    [records, customers, trucks, clients],
  );
  const openMembers = useMemo(
    () =>
      membersOf(records.filter(needsReview), knowledge, (record) =>
        validateTicket(record.ticket, record.recovery),
      ),
    [records, knowledge],
  );
  const exceptions = useMemo(() => groupExceptions(openMembers), [openMembers]);
  const groupsAsked = exceptions.filter((group) => group.type !== 'INDIVIDUAL_CRITICAL_FIELD');
  const ticketsAsked = exceptions.filter((group) => group.type === 'INDIVIDUAL_CRITICAL_FIELD');
  /**
   * What is left to do, in three words each, for the line under the scan on
   * a phone. Worked out from the open questions as they stand, so it goes
   * quiet the moment the last one is answered.
   */
  const liveReview = [
    exceptions.some((group) => group.needsDate) ? t('date unclear') : '',
    openMembers.some((member) => member.recovery && cameraCropFields(member.recovery).length)
      ? t('retake the photo')
      : '',
    groupsAsked.some((group) => group.type === 'NEW_CUSTOMER') ? t('new customer') : '',
    ticketsAsked.some((group) => !group.needsDate) ? t('needs a look') : '',
  ]
    .filter(Boolean)
    .join(', ');

  // What the deployment has learned of the reader's misreads, once.
  useEffect(() => {
    void loadLearnedMisreads();
  }, []);

  // Said to the session, so the top bar on every other page can say it. A
  // possible duplicate waiting to be compared is a ticket that needs a look.
  const duplicatesWaiting = held.filter(awaitsDuplicateReview).length;
  useEffect(() => {
    setDeskField('needsInput', {
      groups: groupsAsked.length,
      tickets: ticketsAsked.length + duplicatesWaiting,
    });
  }, [groupsAsked.length, ticketsAsked.length, duplicatesWaiting]);

  /** What a person has typed against each open question, by group. */
  const [groupAnswers, setGroupAnswers] = useState<Record<string, Record<string, string>>>({});
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<Record<string, string>>({});
  const exceptionsPanel = useRef<HTMLElement>(null);
  const duplicatesPanel = useRef<HTMLElement>(null);
  const answerFor = (group: ExceptionGroup, field: string) =>
    groupAnswers[group.key]?.[field] ??
    (field === 'customer_profile'
      ? group.customerProfileId !== null
        ? String(group.customerProfileId)
        : NEW_CUSTOMER
      : (group.detected[field as keyof Ticket] ?? ''));
  const setAnswer = (group: ExceptionGroup, field: string, value: string) =>
    setGroupAnswers((current) => ({
      ...current,
      [group.key]: { ...current[group.key], [field]: value },
    }));

  /**
   * The date a ticket lost, typed once in the panel. Saved as the app's own
   * bookkeeping so the ticket comes back through classification dated —
   * to pass, or to join its job's question — rather than being marked
   * checked with the rest of it still unsettled.
   */
  async function saveDate(group: ExceptionGroup) {
    if (groupBusy) return;
    const record = records.find((item) => item.id === group.ticketIds[0]);
    const typed = answerFor(group, 'ticket_date');
    if (!record || !ticketDay(typed)) {
      setGroupError((current) => ({ ...current, [group.key]: t('Enter the date as it is printed on the ticket.') }));
      return;
    }
    setGroupBusy(group.key);
    setGroupError((current) => ({ ...current, [group.key]: '' }));
    try {
      const result = await updateSavedRecords([dateEdit(record, ticketDay(typed)!, records)]);
      if ('error' in result) throw new Error(result.error);
      refreshQueueFrom(result.records);
      void noteMisread(dateMisread(record.recovery, ticketDay(typed)!));
      setGroupAnswers((current) => {
        const next = { ...current };
        delete next[group.key];
        return next;
      });
    } catch (error) {
      setGroupError((current) => ({ ...current, [group.key]: errorMessage(error) }));
    } finally {
      setGroupBusy(null);
    }
  }

  /**
   * One answer for a whole job.
   *
   * The customer is settled first — an existing profile, or a new one made
   * from what the tickets printed — then the job site is saved onto that
   * profile, so the next scan from the same job asks nothing. Then every
   * ticket of the group takes the answer, in one save that marks them all
   * checked. The rest of the scan was never waiting on this.
   */
  async function confirmGroup(group: ExceptionGroup) {
    if (groupBusy) return;
    setGroupBusy(group.key);
    setGroupError((current) => ({ ...current, [group.key]: '' }));
    try {
      const now = new Date().toISOString();
      let customer: CustomerProfile | null =
        customers.find((known) => known.id === group.customerProfileId) ?? null;
      const asksCustomer = group.asks.includes('customer_name') || !customer;
      let customerName = customer?.name ?? group.customer ?? '';
      if (asksCustomer) {
        const chosen = answerFor(group, 'customer_profile');
        if (chosen && chosen !== NEW_CUSTOMER) {
          customer = customers.find((known) => String(known.id) === chosen) ?? null;
          customerName = customer?.name ?? customerName;
        } else {
          const typed = (answerFor(group, 'customer_name') || group.customer || '').replace(/\s+/g, ' ').trim();
          if (!typed) throw new Error(t('Enter the customer name.'));
          const printedId = group.detected.customer_id?.trim();
          // No job sites yet: those are saved by a person, from review, once
          // one has been read right.
          const profile = {
            name: typed,
            ticket_customer_ids: printedId ? [printedId] : [],
            ticket_names:
              group.customer && normalizeName(group.customer) !== normalizeName(typed)
                ? [group.customer]
                : [],
            addresses: [] as string[],
            location_rates: [],
            flat_rate: null,
            rate_type: 'flat' as const,
            fuel_charge: null,
            fuel_type: 'flat' as const,
            notes: '',
            created_at: now,
          };
          const error = await saveProfile('customer', profile, null);
          if (error) throw new Error(t(error));
          customer =
            getProfilesSnapshot().customers.find(
              (known) => known.created_at === now && known.name === typed,
            ) ?? null;
          if (!customer) throw new Error(t('The customer was saved but could not be found. Reload and try again.'));
          customerName = customer.name;
        }
      }
      const address = normalizeAddress(
        answerFor(group, 'project_address') || group.detected.project_address || '',
      );
      const project = (answerFor(group, 'project_name') || group.detected.project_name || '').trim();
      // Learned: the job site goes onto the customer, and the next scan from
      // it asks nothing — unless the person said not to keep it, which is
      // their call: a site read a letter wrong, or a one-off delivery, is not
      // one to offer on every later ticket.
      const keepAddress = answerFor(group, SAVE_ADDRESS) !== 'no';
      if (customer && address && keepAddress && !customerAddresses(customer).some((known) => normalizeName(known) === normalizeName(address))) {
        const error = await saveProfile(
          'customer',
          {
            name: customer.name,
            ticket_customer_ids: customer.ticket_customer_ids,
            ticket_names: customer.ticket_names,
            addresses: addCustomerAddress(customer, address),
            location_rates: customerLocationRates(customer),
            flat_rate: customer.flat_rate,
            rate_type: customer.rate_type ?? 'flat',
            fuel_charge: customer.fuel_charge,
            fuel_type: customer.fuel_type ?? 'flat',
            notes: customer.notes,
            created_at: customer.created_at,
          },
          customer.id,
        );
        if (error) throw new Error(t(error));
        customer = getProfilesSnapshot().customers.find((known) => known.id === customer!.id) ?? customer;
      }
      const values: Partial<Record<keyof Ticket, string | null>> = {};
      for (const ask of group.asks) {
        if (ask === 'customer_name') values.customer_name = customerName || null;
        else if (ask === 'project_address') values.project_address = address || null;
        else if (ask === 'project_name') values.project_name = project || null;
        else values[ask] = (answerFor(group, ask) || group.detected[ask] || '').trim() || null;
      }
      const edits = applyGroupAnswer(
        records,
        group,
        { values, customerProfileId: customer?.id ?? null, customer },
        now,
      );
      const result = await updateSavedRecords(edits);
      if ('error' in result) throw new Error(result.error);
      refreshQueueFrom(result.records);
      setGroupAnswers((current) => {
        const next = { ...current };
        delete next[group.key];
        return next;
      });
      toast.add({
        title: t('Applied to {tickets}', { tickets: plural(group.ticketIds.length, 'ticket') }),
        description: customerName
          ? t('{customer} · {tickets} checked and on their invoices.', {
              customer: customerName,
              tickets: plural(group.ticketIds.length, 'ticket'),
            })
          : t('{tickets} checked and on their invoices.', { tickets: plural(group.ticketIds.length, 'ticket') }),
        type: 'success',
      });
    } catch (error) {
      setGroupError((current) => ({ ...current, [group.key]: errorMessage(error) }));
    } finally {
      setGroupBusy(null);
    }
  }
  /**
   * The question closed without a profile: the tickets are filed as read,
   * checked, and no customer is created and nothing is saved onto one. The
   * suggestion to create a customer is only that, and a name the reader got
   * wrong, or a customer hauled for once, is not one to keep. A customer can
   * still be chosen for these tickets in review.
   */
  async function fileWithoutProfile(group: ExceptionGroup) {
    if (groupBusy) return;
    setGroupBusy(group.key);
    setGroupError((current) => ({ ...current, [group.key]: '' }));
    try {
      const edits = applyGroupAnswer(
        records,
        group,
        { values: {}, customerProfileId: null, customer: null },
        new Date().toISOString(),
      );
      const result = await updateSavedRecords(edits);
      if ('error' in result) throw new Error(result.error);
      refreshQueueFrom(result.records);
      setGroupAnswers((current) => {
        const next = { ...current };
        delete next[group.key];
        return next;
      });
      toast.add({
        title: t('Filed {tickets} as read', { tickets: plural(group.ticketIds.length, 'ticket') }),
        description: t('No customer profile was created. Choose one for them in review if they are to be rated.'),
        type: 'success',
      });
    } catch (error) {
      setGroupError((current) => ({ ...current, [group.key]: errorMessage(error) }));
    } finally {
      setGroupBusy(null);
    }
  }
  type Field<K extends keyof DeskSession> =
    | DeskSession[K]
    | ((current: DeskSession[K]) => DeskSession[K]);
  const setQueue = (value: Field<'queue'>) => setDeskField('queue', value);

  /**
   * The review's copies of saved tickets, brought up to date with what was
   * saved: an answer given in the panel, a date typed there, a number moved
   * into date order. A copy somebody is in the middle of editing is left
   * alone, so nothing typed is lost; the rest take the record as it stands,
   * and stop asking for what has been answered.
   */
  const refreshQueueFrom = (updated: SavedRecord[]) => {
    if (!updated.length) return;
    const byId = new Map(updated.map((record) => [record.id, record]));
    setQueue((current) =>
      current.map((item) => {
        const record = item.saved_record_id === null ? undefined : byId.get(item.saved_record_id);
        if (!record || hasChanges(item)) return item;
        const next: QueueItem = {
          ...item,
          ticket: record.ticket,
          invoice: record.invoice,
          batch_id: recordBatch(record),
          ...(record.recovery ? { recovery: record.recovery } : {}),
        };
        return { ...next, baseline: editKey(next) };
      }),
    );
  };

  /**
   * Approving on the evidence: a filed ticket every field of which was read
   * whole or recovered above the bar, from a customer and a job site on
   * file, is marked approved and leaves the "to check" list — the app's own
   * bookkeeping, so `reviewed_at` stays null and the record says which it
   * was. Each ticket is sent once; a write that fails is tried again on the
   * next pass.
   *
   * An approval carries the record as it stands, so it must not cross
   * another write to the same record: it is held back, record by record,
   * for the tickets the running upload is filing and numbering
   * (`filing`), for a ticket on a draft mark still waiting for its number,
   * for a ticket somebody is editing or saving in review, and for the whole
   * ledger while its numbers are out of date order and about to move. It
   * used to wait for the whole upload and every save to finish instead, and
   * a date typed under "Needs your input" while the next ticket was being
   * read left "1 to check" standing until the scan was done.
   */
  const approving = useRef(new Set<number>());
  /** The records the running upload has filed and is still numbering. */
  const filing = useRef(new Set<number>());
  /**
   * True from the first page of an upload to the last number written. The
   * progress bar and the busy state clear when the reading ends, and the
   * numbering runs after that; an approval written in between carried the
   * record's draft mark and could land after the number, leaving an invoice
   * on "Waiting for the rest of this upload" for good.
   */
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (!store.ready) return;
    if (numbersInDateOrder(records, profileStore.company?.invoice_start).size) return;
    const activeId = queue[activeIndex]?.id;
    const editing = new Set(
      queue
        .filter(
          (item) =>
            item.saved_record_id !== null && (hasChanges(item) || (busy && item.id === activeId)),
        )
        .map((item) => item.saved_record_id),
    );
    const byId = new Map(records.map((record) => [record.id, record]));
    const fresh = openMembers.filter((member) => {
      const record = byId.get(member.id);
      return (
        member.report.outcome === 'auto_approved' &&
        !approving.current.has(member.id) &&
        !filing.current.has(member.id) &&
        !editing.has(member.id) &&
        record !== undefined &&
        !isPendingInvoiceNumber(record.invoice.invoice_number)
      );
    });
    if (!fresh.length) return;
    const batch = fresh.slice(0, MAX_EDITS);
    for (const member of batch) approving.current.add(member.id);
    const at = new Date().toISOString();
    const edits: RecordEdit[] = batch.flatMap((member) => {
      const record = byId.get(member.id);
      if (!record) return [];
      return [
        {
          id: record.id,
          ticket: record.ticket,
          invoice: record.invoice,
          ocr_text: record.ocr_text,
          customer_profile_id: record.customer_profile_id ?? null,
          truck_id: record.truck_id ?? null,
          ...(record.recovery ? { recovery: record.recovery } : {}),
          bookkeeping: true,
          auto_approved_at: at,
        },
      ];
    });
    void updateSavedRecords(edits).then(async (result) => {
      if ('error' in result) {
        for (const member of batch) approving.current.delete(member.id);
        return;
      }
      refreshQueueFrom(result.records);
      // Nothing is learned from an approval on its own. A job site goes onto
      // a customer when a person saves it there — the button under the
      // address in review — and not because a scan read it: a site read a
      // letter wrong and saved would be matched to every later ticket.
    });
  }, [openMembers, records, queue, activeIndex, busy, store.ready, profileStore.company?.invoice_start]);

  // Whenever the ledger is quiet, it is asked to read in date order; and the
  // review's copies follow the records, so a number moved from another page
  // is the number shown here.
  useEffect(() => {
    if (!store.ready || extraction !== null || busy || settling) return;
    refreshQueueFrom(records);
    if (!numbersInDateOrder(records, profileStore.company?.invoice_start).size) return;
    void reorderInvoicesByDate().then(refreshQueueFrom);
  }, [records, store.ready, extraction, busy, settling, profileStore.company?.invoice_start]);


  const setActiveIndex = (value: Field<'activeIndex'>) => setDeskField('activeIndex', value);
  const setPending = (value: Field<'pending'>) => setDeskField('pending', value);
  const setBusy = (value: Field<'busy'>) => setDeskField('busy', value);
  const setUploadStatus = (value: Field<'uploadStatus'>) => setDeskField('uploadStatus', value);
  const setExtraction = (value: Field<'extraction'>) => setDeskField('extraction', value);
  const setSaveStatus = (value: Field<'saveStatus'>) => setDeskField('saveStatus', value);
  const setTruckChoice = (value: Field<'truckChoice'>) => setDeskField('truckChoice', value);
  const setAddingTo = (value: Field<'addingTo'>) => setDeskField('addingTo', value);
  const [dragging, setDragging] = useState(false);
  // A client being created from the Bill to client menu.
  const [newClient, setNewClient] = useState<NewClientDraft | null>(null);
  // A customer being created from the Customer profile menu.
  const [newCustomer, setNewCustomer] = useState<NewCustomerDraft | null>(null);
  const newCustomerInput = useRef<HTMLInputElement>(null);
  // Saving a ticket's printed spelling onto the customer it belongs to.
  const [rememberBusy, setRememberBusy] = useState(false);
  // Saving the destination address onto the chosen customer's profile.
  const [addressBusy, setAddressBusy] = useState(false);
  const addFileInput = useRef<HTMLInputElement>(null);
  const [invoiceView, setInvoiceView] = useState<InvoiceView | null>(null);
  /** The photographed ticket, over the screen, while a field is being checked. */
  const [viewingTicket, setViewingTicket] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /**
   * The camera is the session's, not this page's: "Scan ticket" on the home
   * page opens it from there (lib/scanner/hand-off.ts), and this page is
   * mounted whether or not it is the one on the screen. Read the same way as
   * the rest of the session, so there is no effect to run and nothing to miss.
   */
  const setScannerOpen = (value: boolean) => setDeskField('scannerOpen', value);
  const closeScanner = () => setScannerOpen(false);
  const isPhone = useIsPhone();
  /**
   * Which part of the ticket a phone is being asked about. The four sections
   * of the review are one screen each there: a page of thirty boxes is a desk
   * job, and the person holding the phone is standing next to a truck.
   */
  const [step, setStep] = useState(0);
  // Opening a different ticket starts its review at the beginning. Adjusted
  // while rendering rather than in an effect, so the first paint of a new
  // ticket is already its first step instead of the last one of the ticket before.
  const [stepTicket, setStepTicket] = useState(activeIndex);
  if (stepTicket !== activeIndex) {
    setStepTicket(activeIndex);
    setStep(0);
  }
  const reviewPanel = useRef<HTMLElement>(null);
  const scanPanel = useRef<HTMLElement>(null);

  const active = queue[activeIndex] ?? null;
  const ticket = active?.ticket ?? null;
  const issues = ticket ? validateTicket(ticket, active?.recovery) : [];
  const activeSaved = active?.saved_record_id != null;
  /**
   * A ticket filed by "Review later" is saved before anyone has looked at it,
   * and saving it after looking is what marks it checked (see reviewed_at).
   * So it can be saved with nothing changed: otherwise a ticket whose fields
   * were all read correctly could never be taken off the batch's "to check".
   */
  const activeUnchecked =
    active?.saved_record_id != null &&
    (records.find((record) => record.id === active.saved_record_id)?.reviewed_at ??
      null) === null;
  const savedInQueue = queue.filter(
    (item) => item.saved_record_id !== null,
  ).length;
  const reviewCount = records.filter(
    (record) => validateTicket(record.ticket, record.recovery).length > 0,
  ).length;
  const netTons = records.reduce(
    (sum, record) => sum + (record.ticket.net_lb ?? 0) / 2000,
    0,
  );

  const updateActive = (update: (item: QueueItem) => QueueItem) =>
    setQueue((current) =>
      current.map((item, index) =>
        index === activeIndex ? update(item) : item,
      ),
    );

  /**
   * A field as a person leaves it. `how` is what they did to get there:
   * typing is editing, and a candidate accepted with one click — or a field
   * they chose to leave empty — is a decision taken rather than a value
   * typed. Both settle the field; only the record tells them apart.
   */
  const setField = (
    name: TextField | NumberField,
    raw: string,
    how: 'accepted' | 'edited' = 'edited',
  ) =>
    setQueue((current) => {
      const target = current[activeIndex];
      if (!target) return current;
      let value: string | number | null = raw === '' ? null : raw;
      if (value !== null && isNumberField(name)) {
        const parsed = Number(raw);
        value = Number.isFinite(parsed) ? parsed : null;
      }
      // The invoice is dated from its ticket, so correcting the ticket date
      // moves this ticket's invoice date with it — and, when it is saved, the
      // ticket itself onto the invoice of that date (see `invoiceMoveFor`).
      // Only this ticket: the others on the invoice are still the day they
      // say, and re-dating them along with it, as this used to, printed a
      // whole invoice for a day most of its tickets were not.
      const moveInvoiceDate = name === 'ticket_date' && typeof value === 'string';
      // The rate follows the delivery address: a customer charged differently
      // at this site than at the last one has its rate changed with the
      // address. Only then — an address correction that makes no difference to
      // the price leaves a rate typed by hand for this ticket alone.
      const customer =
        name === 'project_address' && target.customer_profile_id !== null
          ? (customers.find((known) => known.id === target.customer_profile_id) ?? null)
          : null;
      return current.map((item, index) => {
        if (index !== activeIndex) return item;
        let next = { ...item, ticket: { ...item.ticket, [name]: value } };
        // Typing in a box the recovery layer had something to say about is a
        // person settling that field, whatever they type and however many
        // times they change their mind: the record keeps the decision, not
        // the keystrokes, and the last one is the one that stands.
        if (item.recovery?.fields[name]) {
          next = { ...next, recovery: confirmValue(item.recovery, name, value, how) };
        }
        if (moveInvoiceDate) {
          next = { ...next, invoice: { ...next.invoice, invoice_date: value as string } };
        }
        if (customer) {
          const was = rateFor(customer, item.ticket.project_address);
          const now = rateFor(customer, next.ticket.project_address);
          // The new site's figures as they are, blanks included: a site with
          // no rate saved must not go out at the last site's price.
          if (JSON.stringify(was) !== JSON.stringify(now)) {
            next = {
              ...next,
              ticket: {
                ...next.ticket,
                rate: now.flat_rate,
                rate_type: now.rate_type,
                fuel_charge: now.fuel_charge,
                fuel_type: now.fuel_type,
              },
            };
          }
        }
        return next;
      });
    });

  /** Invoice details are shared by every ticket from the same upload. */
  const updateBatch = (update: (item: QueueItem) => QueueItem) =>
    setQueue((current) => {
      const batch = current[activeIndex]?.batch_id;
      return current.map((item) =>
        item.batch_id === batch ? update(item) : item,
      );
    });

  /**
   * Invoice details are shared by every ticket from the same upload. The date
   * is not among them and cannot be passed here: it is the ticket's, and the
   * way to move it is to correct the date on the ticket. Spelled out in the
   * type so the compiler refuses any other way of setting it.
   */
  const setInvoice = (patch: Partial<Omit<InvoiceDraft, 'invoice_date'>>) =>
    updateBatch((item) => ({
      ...item,
      invoice: { ...item.invoice, ...patch },
    }));

  const setBillTo = (
    update: (billTo: InvoiceDraft['bill_to']) => InvoiceDraft['bill_to'],
  ) =>
    updateBatch((item) => ({
      ...item,
      invoice: { ...item.invoice, bill_to: update(item.invoice.bill_to) },
    }));

  /**
   * Adds picked or dropped files to the list waiting to be extracted, so
   * tickets can be added in several goes (even during an extraction) and
   * extracted together onto one invoice.
   */
  function chooseFiles(files: FileList | File[] | null) {
    const chosen = Array.from(files ?? []);
    // Reset so choosing the same file again still fires a change event.
    if (fileInput.current) fileInput.current.value = '';
    if (!chosen.length) return;
    setPending((current) => {
      const seen = new Set(current.map(fileKey));
      const added = chosen.filter((file) => {
        const key = fileKey(file);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...current, ...added];
    });
  }

  function removePending(key: string) {
    setPending((current) => current.filter((file) => fileKey(file) !== key));
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFiles(event.dataTransfer.files);
  }

  /**
   * The client a new upload starts billed to: the one chosen as the default,
   * else the client on the most recent queued or saved invoice.
   */
  const recentClientBillTo = (): BillTo | null => {
    const preferred = defaultClient(clients, profileStore.company);
    if (preferred) return clientBillTo(preferred);
    const billTos = [
      ...queue.map((item) => item.invoice.bill_to).reverse(),
      ...[...records].sort((a, b) => b.id - a.id).map((record) => record.invoice.bill_to),
    ];
    for (const billTo of billTos) {
      const client = clientForBillTo(clients, billTo);
      if (client) return clientBillTo(client);
    }
    return null;
  };

  /**
   * Saved, then queued, invoice numbers, oldest first, for numbering the next
   * invoice. Read from the store rather than this render's records: both callers
   * run after an upload has saved or renumbered something, and a number worked
   * out from the list as it was before that would repeat one just given out.
   */
  const invoiceNumbersInOrder = (items: QueueItem[]) => [
    ...[...getRecordsSnapshot().records]
      .sort((a, b) => a.id - b.id)
      .map((record) => record.invoice.invoice_number),
    ...items.map((item) => item.invoice.invoice_number),
  ];

  /**
   * Gives uploads still waiting without an invoice number the next numbers in
   * the series, once there is a number to follow.
   *
   * In ticket-date order, not the order the files came out of the reader: a
   * morning's photographs can be taken in any order, and a run of invoices
   * whose numbers climb while their dates jump about is not a set of books
   * anyone wants to send. See `numbersForWaitingBatches`.
   */
  const numberWaitingBatches = (items: QueueItem[]) => {
    const waiting = items.filter(
      (item) => item.saved_record_id === null && !item.invoice.invoice_number.trim(),
    );
    const assigned = numbersForWaitingBatches(
      invoiceNumbersInOrder(items.filter((item) => item.invoice.invoice_number.trim())),
      waiting.map((item) => ({
        batchId: item.batch_id,
        ticketDate: item.ticket.ticket_date,
      })),
    );
    return items.map((item) => {
      if (item.saved_record_id !== null || item.invoice.invoice_number.trim()) {
        return item;
      }
      const number = assigned.get(item.batch_id);
      return number
        ? { ...item, invoice: { ...item.invoice, invoice_number: number } }
        : item;
    });
  };

  /**
   * Gives this upload's batches their invoice numbers, in ticket-date order.
   *
   * This is the moment a number is decided, and the only one. Every page of the
   * upload has been read by now, so every date is known; the batches are put in
   * date order, oldest first, and take the numbers after the highest invoice on
   * file. Until this runs the batches carry a mark rather than a number, because
   * a number claimed while pages were still in the reader would be a number
   * claimed in the order the pictures were taken.
   *
   * Only this upload's own batches. A ticket photographed for a date that was
   * already invoiced joined that invoice, and an invoice already on file —
   * possibly already sent — keeps the number it was filed under.
   *
   * The session gates it, so an upload is numbered once however many pages ask.
   * A failed write hands the session back and changes nothing: the batches stay
   * marked as waiting rather than half-numbered, and it says so.
   */
  const finalizeInvoiceNumbers = async (
    session: UploadSession,
    filed: QueueItem[],
    opened: Set<string>,
  ): Promise<{ items: QueueItem[]; error: string | null }> => {
    const batchIds = [...new Set(filed.map((item) => item.batch_id))].filter(
      (batchId) => opened.has(batchId),
    );
    if (!batchIds.length) {
      completeSession(session);
      return { items: filed, error: null };
    }
    // Nothing of this upload is still being read, and nobody else has taken it.
    if (!claimFinalize(session)) return { items: filed, error: null };
    const { records } = getRecordsSnapshot();
    const wanted = numbersByTicketDate(records, batchIds);
    const edits: RecordEdit[] = [];
    for (const record of records) {
      const number = wanted.get(recordBatch(record));
      if (number === undefined || number === record.invoice.invoice_number) continue;
      edits.push({
        id: record.id,
        ticket: record.ticket,
        invoice: { ...record.invoice, invoice_number: number },
        ocr_text: record.ocr_text,
        // A record saved before these were kept has neither; an edit needs both.
        customer_profile_id: record.customer_profile_id ?? null,
        truck_id: record.truck_id ?? null,
        // The app numbering its own upload: nobody has checked anything.
        bookkeeping: true,
      });
    }
    if (!edits.length) {
      completeSession(session);
      return { items: filed, error: null };
    }
    const result = await updateSavedRecords(edits);
    if ('error' in result) {
      releaseFinalize(session);
      return { items: filed, error: result.error };
    }
    completeSession(session);
    return {
      items: filed.map((item) => {
        const number = wanted.get(item.batch_id);
        return number
          ? { ...item, invoice: { ...item.invoice, invoice_number: number } }
          : item;
      }),
      error: null,
    };
  };

  /**
   * Callers set busy first; this clears it. With a target, the tickets join
   * that ticket's invoice; otherwise each ticket date gets its own invoice.
   *
   * `open` is whether to put the first of them up for review when it is done.
   * Without it the tickets are read and filed exactly the same way, and simply
   * wait in their date's batch until someone asks for them — which is what
   * "Review later" on a phone does with a photo taken beside a truck.
   */
  async function addToQueue(
    entries: Entry[],
    kind: SourceKind,
    target: QueueItem | null = null,
    open = false,
  ) {
    setSettling(true);
    try {
      await addToQueueSettling(entries, kind, target, open);
    } finally {
      filing.current.clear();
      setSettling(false);
    }
  }

  async function addToQueueSettling(
    entries: Entry[],
    kind: SourceKind,
    target: QueueItem | null,
    open: boolean,
  ) {
    const start = queue.length;
    const added: QueueItem[] = [];
    const failures: string[] = [];
    // Every page of the upload, in order, and what became of it — filed,
    // already on file, or not filed and why — so no page goes unaccounted for.
    const receipt: ReceiptEntry[] = [];
    // The batches this upload opened, whose numbers are this upload's to hand
    // out once every page has been read.
    const openedBatches = new Set<string>();
    const keepReceipt = (): UploadReceipt => {
      const kept = { at: new Date().toISOString(), entries: receipt, opened: [...openedBatches] };
      setDeskField('uploadReceipt', kept);
      return kept;
    };
    /**
     * This upload, held open until nothing in it is still being read. Every page
     * reports itself into it, and no invoice number is decided until they are all
     * terminal — read and filed, failed, or dropped. A page that comes out of the
     * reader first does not take the first number for it.
     */
    const session = openSession(makeId());
    for (const [index] of entries.entries()) {
      noteTicket(session, `file-${index}`, 'queued');
    }
    setUploadStatus(null);
    setDeskField('uploadReceipt', null);
    for (const [index, entry] of entries.entries()) {
      const show = (fraction: number, label: string) =>
        setExtraction({
          index,
          total: entries.length,
          file: entry.name,
          percent: batchPercent(index, entries.length, fraction),
          label,
          // Always shown: the bar is how the scan says it is reading, then
          // resolving, then building invoices, and what it came to is the
          // line under it. It used to hide when the review was not going to
          // open, which is now every scan.
          quiet: false,
        });
      show(0, 'Starting');
      noteTicket(session, `file-${index}`, 'extracting');
      try {
        if (kind === 'upload') {
          if (!ACCEPTED_NAME.test(entry.name)) {
            throw new Error('use PDF, PNG, JPG, TIFF, WebP or text');
          }
          if (entry.blob.size === 0) throw new Error('the file is empty');
          if (entry.blob.size > MAX_BYTES) {
            throw new Error('the file is larger than 20 MB');
          }
        }
        if (kind === 'sample') {
          const sample = await buildQueueItem(entry, kind, profileContext);
          receipt.push({
            file: sample.source.file_name,
            ticketNumber: sample.ticket.ticket_number,
            kind: 'unsaved',
            recordId: null,
            detail: null,
          });
          added.push(sample);
          noteTicket(session, `file-${index}`, 'extracted');
        } else {
          const pages = await extractPages(
            entry.blob,
            guessType(entry.name, entry.blob.type),
            (update) => show(update.fraction, update.label),
          );
          for (const page of pages) {
            const built = await buildQueueItem(entry, kind, profileContext, {
              ...page,
              total: pages.length,
            });
            // Kept before anyone is asked to look at it.
            const stored = getRecordsSnapshot();
            const filed = await fileInBatch(built, stored.records, stored.held);
            const line = {
              file: built.source.file_name,
              ticketNumber: built.ticket.ticket_number,
              matchedId: null,
            };
            if (filed.sameFile) {
              // This very file is stored already, as that record. Nothing new
              // to keep, nothing to queue, and the receipt says which it is.
              receipt.push({ ...line, kind: 'same_file', recordId: filed.sameFile.id, detail: null });
              continue;
            }
            if (filed.suspected) {
              // Kept and held for the side-by-side check, on no invoice. It
              // waits in the duplicates panel, not in the review queue.
              receipt.push({
                ...line,
                kind: 'held',
                recordId: filed.suspected.record.id,
                matchedId: filed.suspected.matched.id,
                detail: null,
              });
              continue;
            }
            if (filed.item.saved_record_id !== null) filing.current.add(filed.item.saved_record_id);
            if (filed.error) failures.push(`${entry.name}: ${t(filed.error)}`);
            if (filed.opened) openedBatches.add(filed.opened);
            receipt.push(
              filed.item.saved_record_id !== null
                ? { ...line, kind: 'saved', recordId: filed.item.saved_record_id, detail: null }
                : { ...line, kind: 'unsaved', recordId: null, detail: filed.error && t(filed.error) },
            );
            added.push(filed.item);
          }
          // Read and filed. Not numbered: that waits for its siblings.
          noteTicket(session, `file-${index}`, 'extracted');
          if (index < entries.length - 1) {
            show(1, 'Filed. Waiting for the rest of this upload');
          }
        }
      } catch (error) {
        failures.push(`${entry.name}: ${t(errorMessage(error))}`);
        receipt.push({
          file: entry.name,
          ticketNumber: null,
          kind: 'failed',
          recordId: null,
          detail: t(errorMessage(error)),
        });
        // The photograph is not lost. A page the reader could not be reached
        // for goes back to the list waiting to be processed, so one tap sends
        // it again; the picture is the thing a driver cannot take twice once
        // the paper has gone with the truck.
        if (kind === 'upload' && entry.blob instanceof File) {
          const file = entry.blob;
          setPending((current) =>
            current.some((waiting) => fileKey(waiting) === fileKey(file)) ? current : [...current, file],
          );
        } else if (kind === 'upload') {
          const file = new File([entry.blob], entry.name, { type: entry.blob.type });
          setPending((current) => [...current, file]);
        }
        // Terminal either way. A file nothing could be read from must not hold
        // the upload open, or one unreadable scan would leave every other ticket
        // of the morning waiting for a number that never came.
        noteTicket(session, `file-${index}`, 'failed');
      }
    }
    setExtraction(null);
    setBusy(false);
    // Said beside the count, not left inside it: a page held as a possible
    // duplicate is not one of the tickets this upload put on an invoice, and
    // the record it matched says what to compare it with.
    const heldNow = receipt.filter((entry) => entry.kind === 'held');
    const sameFiles = receipt.filter((entry) => entry.kind === 'same_file');
    const onFileText = [
      heldNow.length
        ? t('{tickets} held as possible duplicates ({records}), on no invoice until you compare them', {
            tickets: plural(heldNow.length, 'ticket'),
            records: heldNow
              .map((entry) => t('matches record {id}', { id: entry.matchedId! }))
              .join(', '),
          })
        : '',
      sameFiles.length
        ? t('{files} already saved ({records})', {
            files: plural(sameFiles.length, 'file'),
            records: sameFiles.map((entry) => t('record {id}', { id: entry.recordId! })).join(', '),
          })
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (target) {
      const number = target.invoice.invoice_number.trim();
      toast.add({
        title: added.length
          ? number
            ? t('Added {tickets} to invoice {number}', {
                tickets: plural(added.length, 'ticket'),
                number,
              })
            : t('Added {tickets} to the invoice being reviewed', {
                tickets: plural(added.length, 'ticket'),
              })
          : t('No tickets were added'),
        description: [
          added.length ? t('Review and save each new ticket.') : '',
          onFileText,
          ...failures,
        ]
          .filter(Boolean)
          .join(' · '),
        type: failures.length ? 'error' : 'success',
      });
    }
    if (!added.length) {
      keepReceipt();
      if (!target) {
        // What the upload came to is said from the receipt as the line is
        // shown; a page held for comparison was kept, not refused, so "nothing
        // was added" is said only when the receipt has nothing either.
        setUploadStatus({ message: failures.join(' · '), tone: failures.length ? 'error' : 'info', live: true });
      }
      return;
    }
    // The upload read whole. Each page was resolved on its own as it came out
    // of the reader, because it is filed the moment it is read and what is
    // filed must be what was decided; now that the rest of the upload exists,
    // a page that lost its left edge can be heard against the sister page
    // that did not. Batch context is only ever evidence — it is weighed with
    // everything else and cannot outvote print — so a second upload of two
    // unrelated jobs comes back exactly as it went in.
    if (added.some((item) => item.observed)) {
      const snapshot = getRecordsSnapshot().records;
      const known = getProfilesSnapshot();
      const reheard = new Set<number>();
      // Heard again until nothing changes, three rounds at most: a page the
      // pile dates in one round is a whole-dated neighbour for the next, and
      // a pile of faint dates settles itself a page at a time.
      for (let round = 0; round < 3; round++) {
        const others = added.map((item) => ({ ticket: item.ticket, observed: item.observed }));
        let changed = false;
        for (const [index, item] of added.entries()) {
          if (!item.observed) continue;
          const resolved = recoverTicket({
            observed: item.observed,
            paper: item.recovery?.paper,
            extracted: item.ticket,
            records: snapshot,
            profiles: known,
            customer:
              known.customers.find((customer) => customer.id === item.customer_profile_id) ??
              null,
            others,
          });
          if (
            JSON.stringify(resolved.ticket) === JSON.stringify(item.ticket) &&
            JSON.stringify(resolved.recovery) === JSON.stringify(item.recovery)
          ) {
            continue;
          }
          added[index] = { ...item, ticket: resolved.ticket, recovery: resolved.recovery };
          reheard.add(index);
          changed = true;
        }
        if (!changed) break;
      }
      // What the pile settled is written to the records the pages were filed
      // as, so it is what is stored and what is numbered from — a date the
      // pile supplied puts the page on that day's invoice. It used to stay on
      // the screen only: the record kept the first hearing, the copy on the
      // screen read as edited, and the approval waited on an edit nobody
      // had made.
      const filedNow = [...reheard].filter((index) => added[index].saved_record_id !== null);
      if (filedNow.length) {
        const result = await updateSavedRecords(
          filedNow.map((index) => ({ ...editOf(added[index]), bookkeeping: true })),
        );
        if ('error' in result) {
          failures.push(result.error);
        } else {
          for (const index of filedNow) {
            added[index] = { ...added[index], baseline: editKey(editOf(added[index])) };
          }
        }
      }
    }
    setExtraction((current) => current && { ...current, percent: 100, label: 'Resolving ticket data' });
    // One job's scans often miss a field another page read: fill blanks from
    // tickets in this upload with the same order number.
    for (const [index, result] of fillFromSameOrder(
      added.map((item) => item.ticket),
    ).entries()) {
      if (!result.filled.length) continue;
      const item = added[index];
      const filled: QueueItem = {
        ...item,
        ticket: result.ticket,
        note: `${item.note} Filled the ${result.filled.join(', ')} from another ticket with order ${result.ticket.order_number}.`,
        // What the fill did, on the fields themselves. It has always happened
        // quietly behind one sentence of the note; a value that was not on
        // this paper says where it came from like every other one.
        ...(item.recovery
          ? {
              recovery: noteSameOrderFill(
                item.recovery,
                sameOrderFilled(item.ticket, result.ticket),
                sameOrderSource(added, item, result.ticket),
                result.ticket,
              ),
            }
          : {}),
      };
      added[index] =
        item.customer_profile_id === null
          ? applyCustomer(filled, matchCustomer(profileContext.customers, result.ticket))
          : filled;
    }
    let grouped: QueueItem[];
    // Tickets added to an invoice join it only if they are that invoice's date.
    // An invoice is one date's work, and a ticket for another day goes to its
    // own date's invoice instead of being billed on somebody else's.
    const joining = target
      ? added.filter((item) =>
          joinsInvoiceFor(target.ticket.ticket_date, item.ticket.ticket_date),
        )
      : [];
    const elsewhere = target
      ? added.filter((item) => !joining.includes(item))
      : added;
    // Whatever did not join the target, and everything on an ordinary upload,
    // is filed by its own ticket date below.
    const onTarget =
      target && joining.length
        ? joining.map((item) => ({
            ...item,
            batch_id: target.batch_id,
            truck_id: target.truck_id,
            invoice: { ...target.invoice, bill_to: { ...target.invoice.bill_to } },
          }))
        : [];
    if (target && elsewhere.length) {
      failures.push(
        t('{count} for another date went to its own invoice, not {number}.', {
          count: plural(elsewhere.length, 'ticket'),
          number: target.invoice.invoice_number.trim() || t('this one'),
        }),
      );
    }
    {
      const billTo = recentClientBillTo();
      // A ticket already filed on its own date's invoice keeps that invoice:
      // fileInBatch put it there and saved it. Only the number moves, and only
      // into date order — moving the ticket itself is what used to pull a day's
      // tickets onto another day's bill.
      const wasFiled = elsewhere.filter((item) => item.saved_record_id !== null);
      const unfiled = elsewhere.filter((item) => item.saved_record_id === null);
      // Every page is terminal by here, which is what opens the barrier.
      if (extracted(session).length) {
        setUploadStatus({ message: t('Finalizing invoice numbers…'), tone: 'info' });
      }
      setExtraction((current) => current && { ...current, percent: 100, label: 'Building invoices' });
      const ordered = await finalizeInvoiceNumbers(session, wasFiled, openedBatches);
      let filed = ordered.items;
      if (ordered.error) failures.push(ordered.error);
      // And the whole ledger in date order after it: an upload of older
      // tickets moves the newer invoices along to make room.
      const reordered = await reorderInvoicesByDate();
      if (reordered.length) {
        const byId = new Map(reordered.map((record) => [record.id, record]));
        filed = filed.map((item) => {
          const record = item.saved_record_id === null ? undefined : byId.get(item.saved_record_id);
          return record ? { ...item, invoice: record.invoice, batch_id: recordBatch(record) } : item;
        });
        refreshQueueFrom(reordered);
      }
      // One invoice per ticket date, dated that day, oldest first. Invoice
      // numbers continue in order after the latest saved or queued invoice —
      // read after the renumbering above, so they follow it — and a workspace
      // with none yet starts its series here.
      const numbers = invoiceNumbersInOrder(queue);
      const groups = groupByTicketDate(unfiled, (item) => item.ticket.ticket_date);
      grouped = groups.flatMap((group) => {
        // Tickets with no date read wait together, on no invoice and no
        // number, until the date is entered; the batch is the same one filed
        // scans wait in, so they are all in one place.
        const undated = group.date === null;
        const batchId = undated ? UNDATED_BATCH : makeId();
        const number = undated
          ? pendingInvoiceNumber(UNDATED_BATCH)
          : openingInvoiceNumber(numbers);
        if (!undated) numbers.push(number);
        return group.items.map((item) => ({
          ...item,
          batch_id: batchId,
          invoice: {
            ...item.invoice,
            invoice_number: number,
            invoice_date: group.date ?? item.invoice.invoice_date,
            bill_to: { ...(billTo ?? item.invoice.bill_to) },
          },
        }));
      });
      grouped = [...onTarget, ...filed, ...grouped];
      // Said plainly, and first: a ticket nobody can date is a ticket nobody
      // can invoice, and it is waiting rather than billed on a guessed day.
      // Blank and unreadable are one pile here because they need the same
      // thing done to them — the date read off the paper — but the wording
      // covers both, so somebody looking at a ticket with a date on it is not
      // told no date was found on it.
      const undated = grouped.filter((item) => isUndatedBatch(item.batch_id)).length;
      /** The long form of what is wrong, for a screen with room for it. */
      const explained: string[] = [];
      if (undated) {
        const notice = t(
          'No usable date was read from {tickets}, now waiting in “Date not found”, on no invoice. Enter the date to put each on one.',
          { tickets: plural(undated, 'ticket') },
        );
        explained.push(notice);
        toast.add({
          title: t('Date not found on {tickets}', { tickets: plural(undated, 'ticket') }),
          description: notice,
          type: 'error',
        });
      }
      // What this upload filed, the invoices it opened or joined and the
      // pages held for comparison are not counted here: the line says them
      // from the receipt each time it is shown (see `receiptTally`), so it
      // follows a held page onto its invoice rather than going on saying it
      // is held after somebody has compared it.
      keepReceipt();
      // What this scan came to, by what the evidence settled: tickets the
      // app approved on its own, questions about a job to ask once, and
      // tickets with something of their own to look at. Worked out over the
      // records as they stand now, profiles included, so a customer the
      // scan itself just taught is already known by the time it is counted.
      setExtraction((current) => current && { ...current, percent: 100, label: 'Matching jobs' });
      const known = knowledgeOf(getRecordsSnapshot().records, getProfilesSnapshot());
      const outcomes = groupExceptions(
        grouped.map((item, index) => ({
          id: item.saved_record_id ?? -(index + 1),
          ticket: item.ticket,
          recovery: item.recovery,
          report: ticketOutcome(item.ticket, item.recovery, known, validateTicket(item.ticket, item.recovery)),
        })),
      );
      const askedGroups = outcomes.filter((group) => group.type !== 'INDIVIDUAL_CRITICAL_FIELD').length;
      const askedTickets = outcomes.filter((group) => group.type === 'INDIVIDUAL_CRITICAL_FIELD').length;
      const settled = grouped.length - outcomes.reduce((sum, group) => sum + group.ticketIds.length, 0);
      const summary = [
        settled < added.length
          ? [
              askedGroups ? t('{groups} need your input', { groups: plural(askedGroups, 'group') }) : '',
              askedTickets ? t('{tickets} need a look', { tickets: plural(askedTickets, 'ticket') }) : '',
            ]
              .filter(Boolean)
              .join(', ')
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
      // Counted here rather than left to be discovered one ticket at a time:
      // the pages are filed the moment they are read, and somebody who
      // photographed a stack of them beside a truck has put the phone away by
      // now. A sheet that ran off the picture is worth going back for while
      // the paper is still in the cab.
      const toConfirm = grouped.filter(
        (item) => item.recovery && blocksSave(item.recovery),
      ).length;
      const retake = grouped.filter(
        (item) => item.recovery && cameraCropFields(item.recovery).length > 0,
      ).length;
      // What to say, and how much of it. A desk has the room for the whole
      // account; a phone held beside a truck wants the count and, if there
      // is anything to do, what it is in three words — "Please review: date
      // unclear" — and the panel below says the rest.
      const reasons = [
        undated ? t('date unclear') : '',
        retake ? t('retake the photo') : '',
        toConfirm && !undated && !retake ? t('fields cut off') : '',
        askedGroups ? t('new job') : '',
      ].filter(Boolean);
      // On a phone what is stored is the count; what is left to do is said
      // live beside it (see `liveReview`), so that once the date is typed the
      // line stops asking for it.
      void reasons;
      const short = [
        ...failures,
      ]
        .filter(Boolean)
        .join(' · ');
      const long = [
        summary,
        toConfirm
          ? t('{tickets} have fields to confirm against the original.', {
              tickets: plural(toConfirm, 'ticket'),
            })
          : '',
        retake
          ? t(
              '{tickets} were photographed with the sheet running off the picture — retake them.',
              { tickets: plural(retake, 'ticket') },
            )
          : '',
        ...explained,
        ...failures,
      ]
        .filter(Boolean)
        .join(' · ');
      setUploadStatus({
        message: isPhone ? short : long,
        tone: failures.length || undated ? 'error' : 'info',
        live: true,
      });
    }
    setQueue((current) => [...current, ...grouped]);
    setSaveStatus(null);
    // Filed either way — they are in their date's batch already. The evidence
    // approves what it can (see the approval effect), and what it cannot is
    // asked about in the panel above the batches; the review screen opens
    // only when somebody asked for it.
    if (!open) {
      if (!target && !isPhone) {
        exceptionsPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    setActiveIndex(start);
    scrollToReview();
  }

  /** Extracts more tickets onto the invoice under review, such as a saved one being edited. */
  async function addTicketsToInvoice(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    // Reset so choosing the same file again still fires a change event.
    if (addFileInput.current) addFileInput.current.value = '';
    if (!active || busy || !chosen.length) return;
    setBusy(true);
    setAddingTo(active.batch_id);
    await addToQueue(
      chosen.map((file) => ({ blob: file, name: file.name })),
      'upload',
      active,
    );
    setAddingTo(null);
  }

  async function extractPending(open = false) {
    if (busy || !pending.length) return;
    setBusy(true);
    const entries = pending.map((file) => ({ blob: file, name: file.name }));
    setPending([]);
    if (fileInput.current) fileInput.current.value = '';
    await addToQueue(entries, 'upload', null, open);
  }

  function chooseCustomer(value: string) {
    if (value === NEW_CUSTOMER) {
      openNewCustomer();
      return;
    }
    setNewCustomer(null);
    const customer =
      customers.find((item) => String(item.id) === value) ?? null;
    updateActive((item) => applyCustomer(item, customer));
  }

  /**
   * Opens the new customer form with the name scanned off this ticket, or
   * chooses the customer's profile when it already has one.
   */
  function openNewCustomer() {
    if (!active) return;
    const scannedName = active.ticket.customer_name?.replace(/\s+/g, ' ').trim() ?? '';
    const scannedId = active.ticket.customer_id?.trim() ?? '';
    if (!scannedName && !scannedId) {
      toast.add({
        title: t('No customer on this scan'),
        description: t(
          'The ticket has no customer name or number. Enter them in Customer and Job first.',
        ),
        type: 'error',
      });
      return;
    }
    const existing =
      matchCustomer(customers, active.ticket) ??
      customers.find(
        (customer) => scannedName && normalizeName(customer.name) === normalizeName(scannedName),
      ) ??
      null;
    if (existing) {
      setNewCustomer(null);
      updateActive((item) => applyCustomer(item, existing));
      toast.add({
        title: t('{name} already has a customer profile', { name: existing.name }),
        description: t('It is now chosen for this ticket.'),
        type: 'success',
      });
      return;
    }
    setNewCustomer({
      itemId: active.id,
      name: scannedName || `Customer ${scannedId}`,
      error: null,
      saving: false,
    });
    requestAnimationFrame(() => newCustomerInput.current?.focus());
  }

  /**
   * Saves the new customer under the name in the form, with the customer
   * number scanned off this ticket, then links every open ticket it matches.
   */
  async function saveNewCustomer() {
    if (!active || !newCustomer || newCustomer.saving || newCustomer.itemId !== active.id) {
      return;
    }
    const name = newCustomer.name.replace(/\s+/g, ' ').trim();
    if (!name) {
      setNewCustomer({ ...newCustomer, error: t('Enter the customer name.') });
      return;
    }
    const clash = customers.find(
      (customer) => normalizeName(customer.name) === normalizeName(name),
    );
    if (clash) {
      setNewCustomer({
        ...newCustomer,
        error: t('{name} already has a customer profile. Choose it from the list.', {
          name: clash.name,
        }),
      });
      return;
    }
    const ticket = active.ticket;
    const scannedName = ticket.customer_name?.replace(/\s+/g, ' ').trim() ?? '';
    const scannedId = ticket.customer_id?.trim() ?? '';
    const profile = {
      name,
      ticket_customer_ids: scannedId ? [scannedId] : [],
      // A corrected name still matches tickets that print the scanned one.
      ticket_names:
        scannedName && normalizeName(scannedName) !== normalizeName(name)
          ? [scannedName]
          : [],
      // The destination this ticket was delivered to starts the customer's
      // address list, ready to pick on the next ticket whose address is cut
      // off in the scan.
      addresses: addCustomerAddress({}, ticket.project_address ?? ''),
      // The rate on this ticket is what this site is charged, and is kept for
      // it; a customer of its own has no rate, its sites do.
      location_rates:
        ticket.project_address?.trim() && (ticket.rate !== null || ticket.fuel_charge !== null)
          ? [
              {
                address: addCustomerAddress({}, ticket.project_address)[0]!,
                flat_rate: ticket.rate,
                rate_type: rateTypeOf(ticket),
                fuel_charge: ticket.fuel_charge,
                fuel_type: fuelTypeOf(ticket),
              },
            ]
          : [],
      flat_rate: null,
      rate_type: 'flat' as const,
      fuel_charge: null,
      fuel_type: 'flat' as const,
      notes: '',
      created_at: new Date().toISOString(),
    };
    setNewCustomer({ ...newCustomer, saving: true, error: null });
    const error = await saveProfile('customer', profile, null);
    if (error) {
      setNewCustomer((current) => current && { ...current, saving: false, error });
      return;
    }
    setNewCustomer(null);
    const created = getProfilesSnapshot().customers.find(
      (customer) =>
        customer.created_at === profile.created_at && customer.name === profile.name,
    );
    if (!created) return;
    // Other open tickets from the same customer use the new profile too.
    setQueue((current) =>
      current.map((item, index) =>
        index === activeIndex ||
        (!item.saved_record_id &&
          item.customer_profile_id === null &&
          matchCustomer([created], item.ticket))
          ? applyCustomer(item, created)
          : item,
      ),
    );
    toast.add({
      title: t('Added customer {name}', { name: created.name }),
      description: t('Made from the scanned ticket. Edit it any time on Customers & Clients.'),
      type: 'success',
    });
  }

  /**
   * Bills the invoice to a client profile (for every ticket on it), or opens
   * the new client form. A bill-to without a profile starts that form.
   */
  function chooseClient(value: string) {
    if (value === NEW_CLIENT) {
      const current = active?.invoice.bill_to;
      const unsaved =
        current && current.name.trim() && !clientForBillTo(clients, current) ? current : null;
      setNewClient({
        name: unsaved?.name ?? '',
        phone: unsaved?.phone ?? '',
        street: unsaved?.address_lines[0] ?? '',
        city: unsaved?.address_lines[1] ?? '',
        error: null,
        saving: false,
      });
      return;
    }
    setNewClient(null);
    const client = clients.find((item) => String(item.id) === value);
    if (client) setBillTo(() => clientBillTo(client));
  }

  /** Saves the new client as a profile and bills this invoice to it. */
  async function saveNewClient() {
    if (!newClient || newClient.saving) return;
    const name = newClient.name.replace(/\s+/g, ' ').trim();
    if (!name) {
      setNewClient({ ...newClient, error: t('Enter the client company name.') });
      return;
    }
    const existing = clients.find(
      (client) => normalizeName(client.name) === normalizeName(name),
    );
    if (existing) {
      setNewClient({
        ...newClient,
        error: t('{name} already has a client profile. Choose it from the list.', {
          name: existing.name,
        }),
      });
      return;
    }
    setNewClient({ ...newClient, saving: true, error: null });
    const profile = {
      name,
      address_lines: [newClient.street.trim(), newClient.city.trim()] as [string, string],
      phone: newClient.phone.trim(),
      notes: '',
      created_at: new Date().toISOString(),
    };
    const error = await saveProfile('client', profile, null);
    if (error) {
      setNewClient((current) => current && { ...current, saving: false, error });
      return;
    }
    setBillTo(() => ({
      name: profile.name,
      address_lines: profile.address_lines,
      phone: profile.phone,
    }));
    setNewClient(null);
    toast.add({
      title: t('Added client {name}', { name }),
      description: t('This invoice is billed to it, and it can be chosen on future invoices.'),
      type: 'success',
    });
  }

  /** A saved invoice with every saved ticket that carries its number. */
  function savedInvoice(record: SavedRecord): InvoiceView {
    return {
      lines: invoiceLines(records, record.invoice.invoice_number),
      invoice: record.invoice,
    };
  }

  /**
   * Which part of the review a field is in — the phone's step, and the
   * section a desk has to open to see it.
   */
  const sectionOfField = (field: TextField | NumberField): number =>
    TICKET_FIELDS.some((def) => def.name === field)
      ? 0
      : JOB_FIELDS.some((def) => def.name === field)
        ? 1
        : 2;

  /**
   * A reviewed save with a field still nobody has settled: refused, said in
   * one sentence, and the section holding the first of them opened so the
   * refusal points at something rather than being an argument with a button.
   *
   * Only the reviewed saves. Filing a photograph the moment it is taken is
   * untouched — a ticket nobody has looked at yet is allowed to have fields
   * nobody has looked at yet, which is the whole idea of it.
   */
  function blockedByReview(item: QueueItem): boolean {
    if (!item.recovery || !blocksSave(item.recovery)) return false;
    const message = unresolvedMessage(item.recovery);
    if (message) setSaveStatus({ message: t(message), tone: 'error' });
    const first = unresolvedCritical(item.recovery)[0];
    if (first !== undefined) {
      const section = sectionOfField(first as TextField | NumberField);
      setStep(section);
      reviewPanel.current
        ?.querySelectorAll<HTMLDetailsElement>(`.ld-section[data-step="${section}"]`)
        .forEach((details) => {
          details.open = true;
        });
    }
    return true;
  }

  /**
   * What a reviewed ticket teaches the deployment: a date, a number or a
   * weight a person typed over, one character from what the reader read.
   * Only the pair of characters leaves here (see recovery/learned.ts).
   */
  const learnFromReviewed = (item: QueueItem) => {
    const recovery = item.recovery;
    if (!recovery) return;
    if (recovery.fields.ticket_date?.confirmed_by_user && typeof item.ticket.ticket_date === 'string') {
      void noteMisread(dateMisread(recovery, item.ticket.ticket_date));
    }
    for (const field of ['ticket_number', 'gross_lb', 'tare_lb', 'net_lb', 'net_tons'] as const) {
      const value = item.ticket[field];
      if (recovery.fields[field]?.confirmed_by_user && value !== null && value !== undefined) {
        void noteMisread(figureMisread(recovery, field, value));
      }
    }
  };

  async function saveActive(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || busy) return;
    if (blockedByReview(active)) return;
    if (activeSaved) {
      await saveChanges();
      return;
    }
    if (store.error) {
      setSaveStatus({ message: store.error, tone: 'error' });
      return;
    }
    if (!active.invoice.bill_to.name.trim()) {
      setSaveStatus({
        message: t('Choose the client this invoice is billed to, or create a new client.'),
        tone: 'error',
      });
      return;
    }
    // This very file is stored already: there is nothing more of it to keep.
    const sameFile = sameFileOnFile([...records, ...held], active.source);
    if (sameFile) {
      updateActive((item) => ({ ...item, saved_record_id: sameFile.id }));
      setSaveStatus({
        message: t(
          'This file is already saved as record {id} (ticket {ticket}). Nothing was added.',
          { id: sameFile.id, ticket: sameFile.ticket.ticket_number ?? t('unnumbered') },
        ),
        tone: 'info',
      });
      return;
    }
    // A ticket number already on file: kept and held for the side-by-side
    // check, on no invoice. Refusing it here used to leave it in the tab,
    // pointed at the other record, to be lost on the next reload.
    const matched = sameTicketOnFile(records, active.ticket);
    if (matched) {
      setBusy(true);
      const result = await saveSuspectedDuplicate(active, matched);
      setBusy(false);
      if ('error' in result) {
        setSaveStatus({ message: result.error, tone: 'error' });
        return;
      }
      const at = activeIndex;
      setQueue((current) => current.filter((_, index) => index !== at));
      setActiveIndex(-1);
      setSaveStatus(null);
      setUploadStatus({
        message: t(
          'Held as a possible duplicate of record {id}, on no invoice. Compare the two under Possible duplicates.',
          { id: matched.id },
        ),
        tone: 'info',
      });
      return;
    }
    // On the invoice of its date, which may not be the one it was queued on
    // if the date was corrected in review.
    const { item: placed, move } = placedByDate(active);
    let invoiceNumber = placed.invoice.invoice_number.trim();
    // recordBatch also covers tickets saved before uploads were recorded, so a
    // ticket added to one of their invoices is not refused. A number another
    // invoice has is not refused either, when it is one to count from: it is
    // where the series starts, worked back from this invoice's place in date
    // order, and the ledger moves along to make room (see `saveChanges`).
    const clash = findInvoiceClash(records, [
      { id: null, invoiceNumber, batchId: placed.batch_id },
    ]);
    const start =
      clash && move.kind === 'stay' && !isPendingInvoiceNumber(invoiceNumber)
        ? seriesStartFor(records, placed.batch_id, invoiceNumber, [
            { batchId: placed.batch_id, date: placed.ticket.ticket_date },
          ])
        : null;
    if (clash && start === null) {
      setSaveStatus({
        message: t(
          'Invoice number {number} is already used by another upload. Choose another.',
          { number: invoiceNumber },
        ),
        tone: 'error',
      });
      return;
    }

    setBusy(true);
    if (start !== null) {
      if (start !== (profileStore.company?.invoice_start ?? null)) {
        const problem = await saveInvoiceStart(start);
        if (problem) {
          setBusy(false);
          setSaveStatus({ message: problem, tone: 'error' });
          return;
        }
      }
      // Filed on a draft mark, the typed number being another invoice's
      // until the run moves it on; the run then gives this one its number.
      invoiceNumber = pendingInvoiceNumber(`typed-${placed.batch_id}`);
    }
    // Saved tickets on this invoice with changes are saved first, so the
    // invoice details stay the same on every ticket.
    const changedSiblings = queue.filter(
      (item) => item.batch_id === active.batch_id && hasChanges(item),
    );
    if (changedSiblings.length) {
      const error = await persistChanges(changedSiblings);
      if (error) {
        setBusy(false);
        setSaveStatus({ message: error, tone: 'error' });
        return;
      }
    }
    const result = await saveRecord(
      {
        saved_at: new Date().toISOString(),
        ticket: placed.ticket,
        // Saved with the ticket, and by now it says who settled what: a
        // figure on the invoice can be traced back to the paper, and where
        // the paper did not have it, to the person who did.
        ...(placed.recovery ? { recovery: placed.recovery } : {}),
        invoice: { ...placed.invoice, invoice_number: invoiceNumber },
        source: placed.source,
        ocr_text: placed.ocr_text,
        customer_profile_id: placed.customer_profile_id,
        truck_id: placed.truck_id,
        invoice_batch_id: placed.batch_id,
        // Somebody has just been through the fields on the review screen and
        // saved them, which is what being checked means. An edit to a saved
        // ticket is marked the same way (see `applyRecordEdit`); what is filed
        // unchecked is a scan nobody has looked at yet.
        reviewed_at: new Date().toISOString(),
      },
      active.original,
    );
    if ('error' in result) {
      setBusy(false);
      setSaveStatus({ message: result.error, tone: 'error' });
      return;
    }
    let { record } = result;
    let reordered: SavedRecord[] = [];
    if (start !== null) {
      // The ledger in date order from the new start, this invoice in it.
      reordered = await reorderInvoicesByDate();
      const mine = reordered.find((item) => item.id === record.id);
      if (mine) {
        record = mine;
        invoiceNumber = mine.invoice.invoice_number.trim();
      }
    }
    setBusy(false);
    learnFromReviewed(placed);
    const originalStored = record.original_stored;

    const label = record.ticket.ticket_number ?? active.source.file_name;
    const markSaved = (item: QueueItem): QueueItem => {
      const saved = {
        ...item,
        // Where it was put, which is where it is from now on.
        batch_id: placed.batch_id,
        invoice: { ...placed.invoice, invoice_number: invoiceNumber },
        saved_record_id: record.id,
      };
      return { ...saved, baseline: editKey(saved) };
    };
    const updated = queue.map((item, index) =>
      index === activeIndex ? markSaved(item) : item,
    );
    setQueue((current) =>
      current.map((item) => (item.id === active.id ? markSaved(item) : item)),
    );
    // The invoices that moved along, as they are now.
    refreshQueueFrom(reordered);
    // A first invoice number sets the order for uploads still waiting for one.
    setQueue(numberWaitingBatches);
    // Straight on to the next ticket waiting to be checked, by what is stored
    // rather than by position in the queue.
    const reviewed = updated.length;
    const next = openNextToReview(updated, activeIndex);
    if (next >= 0) {
      setSaveStatus({
        message: t('Saved {label}. Now reviewing ticket {next}.', { label, next: next + 1 }),
        tone: 'info',
      });
    } else {
      setUploadStatus({
        message: t('All tickets reviewed ({tickets}).', {
          tickets: plural(reviewed, 'ticket'),
        }),
        tone: 'info',
      });
    }
    toast.add({
      title: t('Saved ticket {label}', { label }),
      description: [
        movedNote(move, placed),
        start !== null
          ? t('Invoice numbers now run from {start}; the other invoices moved along.', { start })
          : '',
        lineTotal(record.ticket) === null
          ? t('Invoice {number} is a draft until its rate is complete.', { number: invoiceNumber })
          : t('Invoice {number} created.', { number: invoiceNumber }),
        originalStored ? '' : t('The original could not be stored in this browser.'),
      ]
        .filter(Boolean)
        .join(' '),
      type: 'success',
    });
  }

  /**
   * Saves changes to saved tickets, then marks what was sent as saved. Edits
   * typed while it saves stay unsaved. Returns an error message, or null.
   */
  async function persistChanges(
    items: QueueItem[],
    moved: { id: string; batchId: string } | null = null,
  ): Promise<string | null> {
    const edits = items.map((item) =>
      editOf(item, moved && item.id === moved.id ? moved.batchId : undefined),
    );
    const result = await updateSavedRecords(edits);
    if ('error' in result) return result.error;
    for (const item of items) learnFromReviewed(item);
    const sent = new Map(items.map((item, index) => [item.id, [item, edits[index]] as const]));
    setQueue((current) =>
      current.map((item) => {
        const found = sent.get(item.id);
        if (!found) return item;
        const [saved, edit] = found;
        const number = edit.invoice.invoice_number;
        // A ticket that went to another invoice is on it now: its batch and its
        // invoice details are what was saved, not what the screen had.
        const placed = edit.invoice_batch_id
          ? { ...item, batch_id: edit.invoice_batch_id, invoice: saved.invoice }
          : item;
        // The number as saved — not what was typed, when the typed number
        // was too low for the invoice's place in the series.
        return {
          ...placed,
          invoice: { ...placed.invoice, invoice_number: number },
          baseline: editKey(edit),
        };
      }),
    );
    return null;
  }

  /**
   * The active ticket on the invoice of its date, as it will be saved, and the
   * move that put it there. Nothing changes for a ticket already where it
   * belongs; a ticket whose date was corrected joins the invoice already filed
   * for that date, or opens one when it is leaving other tickets behind.
   *
   * Read from the store, not this render's records, so a ticket saved a moment
   * ago on another invoice of that date is found and joined.
   */
  function placedByDate(item: QueueItem): { item: QueueItem; move: InvoiceMove } {
    const others = getRecordsSnapshot().records.filter(
      (record) => record.id !== item.saved_record_id,
    );
    const queued = queue
      .filter((other) => other.id !== item.id && other.saved_record_id === null)
      .map((other) => ({ batchId: other.batch_id, date: other.ticket.ticket_date }));
    const move = invoiceMoveFor(
      { batchId: item.batch_id, date: item.ticket.ticket_date },
      others,
      queued,
    );
    if (move.kind === 'stay') return { item, move };
    if (move.kind === 'join') {
      return {
        move,
        item: {
          ...item,
          batch_id: move.batchId,
          // Their invoice, details and all: it is one of theirs now.
          invoice: { ...move.invoice, bill_to: { ...move.invoice.bill_to } },
        },
      };
    }
    return {
      move,
      item: {
        ...item,
        batch_id: move.batchId,
        invoice: { ...item.invoice, invoice_number: move.invoiceNumber },
      },
    };
  }

  /** What to say about a ticket that went to another invoice, or nothing. */
  const movedNote = (move: InvoiceMove, item: QueueItem) =>
    move.kind === 'stay'
      ? ''
      : move.kind === 'join'
        ? t('Moved to invoice {number}, with the other tickets for {date}.', {
            number: shownInvoiceNumber(item.invoice.invoice_number) || t('(waiting)'),
            date: date(item.ticket.ticket_date),
          })
        : t('Moved to its own invoice, {number}, for {date}.', {
            number: item.invoice.invoice_number,
            date: date(item.ticket.ticket_date),
          });

  /** Saves the changes on this invoice's saved tickets together. */
  async function saveChanges() {
    if (!active) return;
    if (blockedByReview(active)) return;
    const changed = queue.filter(
      (item) => item.batch_id === active.batch_id && hasChanges(item),
    );
    // Nothing to correct on a ticket nobody has checked yet is still something
    // to save: saving it is the checking.
    const withActive =
      activeUnchecked && !changed.some((item) => item.id === active.id)
        ? [...changed, active]
        : changed;
    if (!withActive.length) return;
    // The active ticket goes to the invoice of its date, which is not this one
    // if its date was corrected. The others stay where they are.
    const { item: placed, move } = placedByDate(active);
    let toSave = withActive.map((item) => (item.id === active.id ? placed : item));
    // A number typed onto an invoice is where the series starts, worked back
    // from this invoice's place in date order: typed onto the first invoice
    // it is the number itself. The rest of the ledger follows — every other
    // invoice takes the number its place gives it from there — so a number
    // another invoice has now is not refused, it is moved on. Set before the
    // save, and the ledger renumbered before it too, so the number this
    // invoice is saved with is the one the run gives it.
    const stored = records.find((record) => record.id === active.saved_record_id);
    const typedNumber = active.invoice.invoice_number.trim();
    const typed =
      move.kind === 'stay' &&
      stored !== undefined &&
      typedNumber !== stored.invoice.invoice_number.trim() &&
      !isPendingInvoiceNumber(typedNumber);
    const start = typed ? seriesStartFor(records, placed.batch_id, typedNumber) : null;
    if (start === null) {
      const clash = findInvoiceClash(
        records,
        toSave.map((item) => ({
          id: item.saved_record_id,
          invoiceNumber: item.invoice.invoice_number,
          batchId: item.batch_id,
        })),
      );
      if (clash) {
        setSaveStatus({
          message: t(
            'Invoice number {number} is already used by another upload. Choose another.',
            { number: clash },
          ),
          tone: 'error',
        });
        return;
      }
    }
    setBusy(true);
    let renumbered: string | null = null;
    if (start !== null) {
      if (start !== (profileStore.company?.invoice_start ?? null)) {
        const problem = await saveInvoiceStart(start);
        if (problem) {
          setBusy(false);
          setSaveStatus({ message: problem, tone: 'error' });
          return;
        }
      }
      refreshQueueFrom(await reorderInvoicesByDate());
      // The number the run gave this invoice: what was typed, unless what
      // was typed was too low for its place.
      renumbered =
        getRecordsSnapshot()
          .records.find((record) => recordBatch(record) === placed.batch_id)
          ?.invoice.invoice_number.trim() ?? typedNumber;
      const number = renumbered;
      toSave = toSave.map((item) => ({ ...item, invoice: { ...item.invoice, invoice_number: number } }));
    }
    const error = await persistChanges(
      toSave,
      move.kind === 'stay' ? null : { id: active.id, batchId: placed.batch_id },
    );
    setBusy(false);
    if (error) {
      setSaveStatus({ message: error, tone: 'error' });
      return;
    }
    const invoiceNumber = renumbered ?? placed.invoice.invoice_number.trim();
    const label = active.ticket.ticket_number ?? active.source.file_name;
    const moved = movedNote(move, placed);
    const message = moved
      ? moved
      : renumbered !== null && renumbered !== typedNumber
        ? t('Invoice numbers now run from {start} in date order; this invoice is {number}.', {
            start: start ?? '',
            number: renumbered,
          })
        : renumbered !== null
          ? t('Invoice numbers now run from {start}; the other invoices moved along.', {
              start: start ?? '',
            })
          : !changed.length
        ? t('Checked. Nothing needed changing.')
        : toSave.length > 1
          ? t('Saved changes to {tickets} on invoice {number}.', {
              tickets: plural(toSave.length, 'ticket'),
              number: invoiceNumber,
            })
          : t('Changes saved.');
    // On to the next ticket waiting to be checked. This used to stay on the one
    // just finished unless every ticket in the queue happened to be saved and
    // unchanged, so a batch filed by "Review later" had to be picked out of the
    // list again for each ticket in it. The queue as saved: the ticket on the
    // invoice it went to, so the review carries on from where it is now.
    const next = openNextToReview(
      queue.map((item) => (item.id === active.id ? placed : item)),
      activeIndex,
    );
    if (next >= 0) {
      setSaveStatus({
        message: `${message} ${t('Now reviewing ticket {next}.', { next: next + 1 })}`,
        tone: 'info',
      });
    } else {
      setUploadStatus({ message, tone: 'info' });
    }
    toast.add({
      title:
        changed.length > 1
          ? t('Updated invoice {number}', { number: invoiceNumber })
          : t('Updated ticket {label}', { label }),
      description:
        changed.length > 1
          ? t('Saved with your changes: {tickets}.', {
              tickets: plural(changed.length, 'ticket'),
            })
          : t('Your changes are saved for everyone in your workspace.'),
      type: 'success',
    });
  }

  /**
   * Where a review starts from. On a phone that is the top of the page: the
   * band carries the ticket's own head now — which ticket, which step, the
   * checks, the way round the other tickets — so bringing the panel into view
   * would open the review with the first thing to read already above the
   * screen. On a desk the panel is still what to scroll to.
   */
  const scrollToReview = () =>
    requestAnimationFrame(() => {
      if (isPhone) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const panel = reviewPanel.current;
      if (!panel) return;
      // Level with the top of the menu down the left, which is fixed to the
      // window and floats a little in from its edge: the panel and the menu
      // then share a top line, rather than the panel sitting hard against the
      // top of the window. Measured off the menu rather than assumed, so it
      // stays level if the menu's inset ever changes.
      const menu = document.querySelector('.workspace-sidebar [data-slot="sidebar-inner"]');
      const room = menu ? menu.getBoundingClientRect().top : 0;
      window.scrollTo({
        top: window.scrollY + panel.getBoundingClientRect().top - room,
        behavior: 'smooth',
      });
    });

  /** Back to the scan panel, which is where the next upload starts. */
  const scrollToScan = () =>
    requestAnimationFrame(() =>
      scanPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );

  /**
   * Opens the next ticket still waiting to be checked, and returns where it is
   * in the queue. -1 when none is left: the review closes and the page goes back
   * to the scan panel, ready for the next load of tickets.
   *
   * Called after the save has been stored, never before, and the marks it goes
   * by are read from the store rather than from this render — the ticket just
   * finished is checked by then, so it is passed over instead of being offered
   * again. `items` is the queue in the order it is shown, which is the order
   * reviewing follows.
   */
  const openNextToReview = (items: QueueItem[], from: number): number => {
    const { records: saved } = getRecordsSnapshot();
    const next = nextReviewStop(reviewStops(items, saved), from);
    if (next >= 0) {
      setActiveIndex(next);
      scrollToReview();
      return next;
    }
    clearQueue();
    scrollToScan();
    return -1;
  };

  /**
   * The ticket's picture, over the page, for a saved ticket: on a phone,
   * what somebody asked for a missing date wants is the photograph to read
   * it off, not thirty boxes. The ticket is put on the review as usual but
   * not scrolled to, and the picture opens as soon as it has loaded.
   */
  function openTicketPicture(record: SavedRecord) {
    // Nothing to do with the review: the picture is loaded on its own and
    // shown over whatever page this is, and closing it leaves the page as
    // it was. Putting the ticket on the review to show its picture opened
    // the review under it, and closing the picture left the review open.
    const shown = itemFromRecord(record, recordBatch(record));
    setPictureOf({ ...shown, preview_status: 'loading' });
    void loadStoredOriginal(record).then((blob) => {
      if (!blob) {
        toast.add({ title: t('The original is not stored for this ticket.'), type: 'error' });
      }
      setPictureOf((current) => {
        if (!current || current.saved_record_id !== record.id) return current;
        if (!blob) return null;
        return {
          ...current,
          original: blob,
          preview_url:
            URL.createObjectURL(blob) + (record.source.page ? `#page=${record.source.page}` : ''),
          preview_status: 'ready',
        };
      });
    });
  }

  /** The photograph opened from the panel, over the page; null when none is. */
  const [pictureOf, setPictureOf] = useState<QueueItem | null>(null);
  const closePicture = () => {
    setPictureOf((current) => {
      if (current?.preview_url) URL.revokeObjectURL(current.preview_url.split('#')[0]);
      return null;
    });
  };

  /** Reopens a saved ticket, with the other saved tickets on its invoice, to edit. */
  function editSaved(record: SavedRecord, scroll = true) {
    const open = queue.findIndex((item) => item.saved_record_id === record.id);
    if (open >= 0) {
      setActiveIndex(open);
      if (scroll) scrollToReview();
      return;
    }
    const batchId = recordBatch(record);
    const lines = invoiceLines(records, record.invoice.invoice_number).filter(
      (line) => !queue.some((item) => item.saved_record_id === line.id),
    );
    const added = lines.map((line) => itemFromRecord(line, batchId));
    setQueue((current) => [...current, ...added]);
    setActiveIndex(
      queue.length + Math.max(0, lines.findIndex((line) => line.id === record.id)),
    );
    setSaveStatus(null);
    if (scroll) scrollToReview();
    // The pictures, a few at a time rather than all at once: each one is a
    // request the server has to carry while it lasts, and an invoice of a
    // dozen tickets fetched together is a dozen at once.
    const showPicture = (line: SavedRecord, itemId: string) =>
      loadStoredOriginal(line).then((blob) => {
        setQueue((current) =>
          current.map((item) => {
            if (item.id !== itemId) return item;
            if (!blob) return { ...item, preview_status: 'missing' };
            return {
              ...item,
              original: blob,
              preview_url:
                URL.createObjectURL(blob) +
                (line.source.page ? `#page=${line.source.page}` : ''),
              preview_status: 'ready',
            };
          }),
        );
      });
    const pending = lines.map((line, index) => [line, added[index].id] as const);
    const lane = async () => {
      for (let next = pending.shift(); next; next = pending.shift()) {
        await showPicture(next[0], next[1]);
      }
    };
    for (let lanes = 0; lanes < PICTURE_LANES; lanes++) void lane();
  }

  function clearQueue() {
    for (const item of queue)
      URL.revokeObjectURL(item.preview_url.split('#')[0]);
    setQueue([]);
    setActiveIndex(-1);
    setSaveStatus(null);
  }

  function downloadLedger() {
    const url = URL.createObjectURL(
      new Blob([ledgerCsv(records)], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'load_tickets.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearUnreadableRecords() {
    if (
      window.confirm(
        t('Clear the unreadable saved tickets in this browser? This cannot be undone.'),
      )
    ) {
      clearLocalRecords();
    }
  }

  /** `under` goes below the box, for a field with more than a box to it. */
  /**
   * A step's fields, with the short heading each run of them opens with on a
   * phone. Returned as a list so the headings sit in the same grid as the
   * fields and can span it.
   */
  const renderFields = (defs: FieldDef[], under?: (def: FieldDef) => ReactNode) =>
    defs.flatMap((def) => {
      const field = renderField(def, under?.(def));
      if (!isPhone || !def.group) return field ? [field] : [];
      return [
        <p key={`run-${def.group}`} className="ld-run">
          {t(def.group)}
        </p>,
        ...(field ? [field] : []),
      ];
    });

  /**
   * A field nobody has settled: what the resolver decided, or what a person
   * decided afterwards, put in words for somebody holding the paper.
   *
   * The wording says what to do, not what the layer calls it. "Ambiguous
   * candidates" is a state of the evidence; "more than one on file fits" is
   * the thing a reviewer can act on with the ticket in front of them.
   */
  function reviewReason(resolution: FieldResolution): string {
    const reason: ReviewReason | undefined = resolution.reason;
    if (reason === 'camera_crop') {
      return t('The sheet ran off the photograph on this side. Retake the picture.');
    }
    if (reason === 'partial_numeric') {
      return t('Part of this was cut off the print, and a number is never completed by guessing.');
    }
    if (reason === 'ambiguous_candidates') {
      return t('More than one value on file fits what printed.');
    }
    if (reason === 'conflicting_evidence') {
      return t('Two sources disagree about this field.');
    }
    if (reason === 'unsupported_proposal') {
      return t('The reader suggested a completion nothing on file supports.');
    }
    if (reason === 'not_read') {
      return t('What printed here could not be read as a value.');
    }
    if (reason === 'insufficient_evidence') {
      return t('Part of the print is missing and nothing on file completes it.');
    }
    return t('Nothing of this field is on the paper — the print ran off the sheet.');
  }

  /** Whether a field is still waiting for somebody to settle it. */
  const unsettledField = (resolution: FieldResolution) =>
    resolution.status === 'needs_review' ||
    resolution.reason === 'camera_crop' ||
    (resolution.status === 'missing' && resolution.source_clipped);

  /**
   * What the recovery layer has to say about one field, under its box.
   *
   * Nothing at all for a field read whole off the paper, which is nearly
   * every field of nearly every ticket: a ticket that came through clean
   * looks exactly as it did before any of this existed. A field that was
   * completed says so quietly and keeps its working folded away; only a
   * field waiting on a person is allowed to be loud, and even then the box
   * itself stays an ordinary box somebody can type in.
   */
  const recoveryUnder = (def: FieldDef): ReactNode => {
    const resolution = active?.recovery?.fields[def.name];
    if (!resolution || resolution.status === 'exact') return null;
    if (resolution.status === 'confirmed') {
      return (
        <small className="ld-field-hint ld-recovered">
          {resolution.value === null
            ? t('Left empty by reviewer')
            : t('Confirmed by reviewer')}
        </small>
      );
    }
    if (resolution.status === 'recovered') {
      return (
        <div className="ld-recovered">
          <small className="ld-field-hint">
            {resolution.source === 'batch_context'
              ? t('Filled from another ticket with the same order number')
              : resolution.visible_text && ['verified_profile', 'verified_history', 'user_correction'].includes(resolution.source ?? '')
                ? t('From what is on file — the ticket shows “{print}”', { print: resolution.visible_text })
                : resolution.visible_text
                  ? t('Recovered from partial print — the ticket shows “{print}”', {
                      print: resolution.visible_text,
                    })
                  : t('Not printed whole here — worked out from the rest of the ticket')}
          </small>
          {resolution.evidence.length ? (
            <details className="ld-why">
              <summary>{t('Why')}</summary>
              <ul>
                {resolution.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      );
    }
    if (!unsettledField(resolution)) return null;
    // The job and the site are never a question (SILENT_FIELDS): what was
    // read stands, and this only says so, quietly, with what is on file a
    // tap away for anyone who wants to change it.
    if (SILENT_FIELDS.has(def.name)) {
      const options = resolution.candidates ?? [];
      return (
        <div className="ld-recovered">
          <small className="ld-field-hint">
            {resolution.visible_text
              ? t('Read from a cut-off line — the ticket shows “{print}”', { print: resolution.visible_text })
              : t('Not read whole on this ticket')}
          </small>
          {options.length ? (
            <span className="ld-confirm-actions">
              {options.map((candidate) => (
                <Button key={candidate} type="button" variant="secondary" size="xs" onClick={() => setField(def.name, candidate, 'accepted')}>
                  <span className="ui-literal">{candidate}</span>
                </Button>
              ))}
            </span>
          ) : null}
        </div>
      );
    }
    // A camera crop is not a question about the value, it is a question
    // about the photograph: offering candidates for print that was never in
    // the picture is exactly the guessing this layer exists to refuse.
    const crop = resolution.reason === 'camera_crop';
    const candidates = crop ? [] : (resolution.candidates ?? []);
    return (
      <div className="ld-near-match" data-tone={crop ? 'bad' : 'warning'}>
        <span>{reviewReason(resolution)}</span>
        {resolution.visible_text ? (
          <span>
            {t('The original shows “{print}”', { print: resolution.visible_text })}
          </span>
        ) : null}
        {candidates.length || (!crop && canLeaveEmpty(def.name)) ? (
          <span className="ld-confirm-actions">
            {candidates.map((candidate) => (
              <Button
                key={candidate}
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => {
                  // The candidate is the print; the box wants the value.
                  const value = acceptableValue(def.name, candidate);
                  if (value === null) {
                    setSaveStatus({ message: t('That value is not a number.'), tone: 'error' });
                    return;
                  }
                  setField(def.name, value, 'accepted');
                }}
              >
                {t('Accept “{value}”', { value: candidate })}
              </Button>
            ))}
            {!crop && canLeaveEmpty(def.name) ? (
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => setField(def.name, '', 'accepted')}
              >
                {t('Leave empty')}
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    );
  };

  /** The state the box itself shows, or nothing for a field read whole. */
  const recoveryMark = (def: FieldDef): string | undefined => {
    const resolution = active?.recovery?.fields[def.name];
    if (!resolution || resolution.status === 'exact') return undefined;
    if (SILENT_FIELDS.has(def.name) && unsettledField(resolution)) return 'recovered';
    if (resolution.status === 'confirmed') return 'confirmed';
    if (resolution.status === 'recovered') return 'recovered';
    return unsettledField(resolution) ? 'needs-review' : undefined;
  };

  const renderField = (def: FieldDef, under?: ReactNode) => {
    if (!ticket) return null;
    const value = ticket[def.name];
    const numeric = isNumberField(def.name);
    const caption = (
      <>
        {t(def.label)}
        {def.required ? (
          <span className="ld-required" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </>
    );
    // What the recovery layer has to say goes above whatever the field
    // already carried — the address picker under the destination — because
    // it is about the value in the box rather than another way to fill it.
    const recovery = recoveryUnder(def);
    const below =
      recovery && under ? (
        <>
          {recovery}
          {under}
        </>
      ) : (recovery ?? under);
    const box = (
      <Input
        id={below ? `${fieldId}-${def.name}` : undefined}
        name={def.name}
        type={def.type ?? (numeric ? 'number' : 'text')}
        min={numeric ? 0 : undefined}
        step={def.step}
        required={def.required}
        data-recovery={recoveryMark(def)}
        value={value === null ? '' : String(value)}
        onChange={(event) => setField(def.name, event.target.value)}
      />
    );
    // A label may only wrap the one control it names, so a field with buttons
    // under it names its box with htmlFor instead.
    return below ? (
      <div key={def.name} className="ld-field" data-span={def.span}>
        <label htmlFor={`${fieldId}-${def.name}`}>{caption}</label>
        {box}
        {below}
      </div>
    ) : (
      <label key={def.name} className="ld-field" data-span={def.span}>
        <span>{caption}</span>
        {box}
      </label>
    );
  };

  const invoiceField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: {
      type?: string;
      required?: boolean;
      span?: 2;
      newRow?: boolean;
      placeholder?: string;
      hint?: string;
      /** Shown, not asked for: the value is worked out from something else. */
      readOnly?: boolean;
    } = {},
  ) => (
    <label
      className="ld-field"
      data-span={options.span}
      data-new-row={options.newRow || undefined}
    >
      <span>
        {label}
        {options.required ? (
          <span className="ld-required" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </span>
      <Input
        type={options.type ?? 'text'}
        required={options.required}
        placeholder={options.placeholder}
        readOnly={options.readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {options.hint ? <small className="ld-field-hint">{options.hint}</small> : null}
    </label>
  );

  const activeTrucks = trucks.filter((truck) => truck.active);
  // The truck chosen for this session, or the workspace's default truck when
  // none has been: an owner-driver's scans are all their own truck's, and
  // picking it on every visit was the one thing left to do before scanning.
  // Choosing "No truck profile" is a choice, and is kept for the session.
  const uploadTruck =
    truckChoice === NO_TRUCK
      ? null
      : (activeTrucks.find((truck) => String(truck.id) === truckChoice) ??
        defaultTruck(activeTrucks, profileStore.company));
  const profileContext: ProfileContext = {
    customers,
    truck: uploadTruck,
    billTo: recentClientBillTo(),
  };
  const activeCustomer = active
    ? (customers.find((item) => item.id === active.customer_profile_id) ?? null)
    : null;
  const printedName = active?.ticket.customer_name?.replace(/\s+/g, ' ').trim() ?? '';
  const scannedMatch =
    active && printedName ? matchCustomerDetailed(customers, active.ticket) : null;
  /** The chosen customer was found through a printed name that is slightly off. */
  const misprint =
    scannedMatch?.how === 'near' && scannedMatch.customer.id === activeCustomer?.id
      ? scannedMatch
      : null;

  /** Keeps this ticket's spelling on the customer, so it matches exactly next time. */
  async function rememberSpelling() {
    if (!activeCustomer || !printedName || rememberBusy) return;
    setRememberBusy(true);
    const error = await saveProfile(
      'customer',
      {
        name: activeCustomer.name,
        ticket_customer_ids: activeCustomer.ticket_customer_ids,
        ticket_names: [...activeCustomer.ticket_names, printedName],
        addresses: customerAddresses(activeCustomer),
        location_rates: customerLocationRates(activeCustomer),
        flat_rate: activeCustomer.flat_rate,
        rate_type: activeCustomer.rate_type ?? 'flat',
        fuel_charge: activeCustomer.fuel_charge,
        fuel_type: activeCustomer.fuel_type ?? 'flat',
        notes: activeCustomer.notes,
        created_at: activeCustomer.created_at,
      },
      activeCustomer.id,
    );
    setRememberBusy(false);
    toast.add(
      error
        ? { title: t('Could not save the spelling'), description: t(error), type: 'error' }
        : {
            title: t('Spelling remembered'),
            description: t('Tickets printed “{printed}” now match {name} exactly.', {
              printed: printedName,
              name: activeCustomer.name,
            }),
            type: 'success',
          },
    );
  }
  /**
   * Destinations saved on the chosen customer's profile. Tickets are scanned
   * with the left edge cut off often enough that the delivery address on them
   * cannot be read; where this customer hauls to is known, so it is offered
   * for one click rather than squinted at or typed out again.
   */
  const savedAddresses = customerAddresses(activeCustomer);
  const typedAddress = normalizeAddress(ticket?.project_address ?? '');
  const sameAddress = (value: string) =>
    normalizeName(value) === normalizeName(typedAddress);
  const addressOnFile = Boolean(typedAddress) && savedAddresses.some(sameAddress);

  /** Keeps this ticket's destination on the customer, to pick on the next one. */
  async function rememberAddress() {
    if (!activeCustomer || !typedAddress || addressBusy) return;
    setAddressBusy(true);
    const error = await saveProfile(
      'customer',
      {
        name: activeCustomer.name,
        ticket_customer_ids: activeCustomer.ticket_customer_ids,
        ticket_names: activeCustomer.ticket_names,
        addresses: addCustomerAddress(activeCustomer, typedAddress),
        location_rates: customerLocationRates(activeCustomer),
        flat_rate: activeCustomer.flat_rate,
        rate_type: activeCustomer.rate_type ?? 'flat',
        fuel_charge: activeCustomer.fuel_charge,
        fuel_type: activeCustomer.fuel_type ?? 'flat',
        notes: activeCustomer.notes,
        created_at: activeCustomer.created_at,
      },
      activeCustomer.id,
    );
    setAddressBusy(false);
    toast.add(
      error
        ? { title: t('Could not save the address'), description: t(error), type: 'error' }
        : {
            title: t('Address saved to {name}', { name: activeCustomer.name }),
            description: t('Pick it on the next ticket instead of typing it again.'),
            type: 'success',
          },
    );
  }

  const addressPicker = (
    <div className="ld-address-picker">
      {savedAddresses.length ? (
        <>
          <span id={`${fieldId}-addresses`}>
            {t('Saved for {name}', { name: activeCustomer?.name ?? '' })}
          </span>
          <ul aria-labelledby={`${fieldId}-addresses`}>
            {savedAddresses.map((address) => (
              <li key={address}>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  data-chosen={sameAddress(address) || undefined}
                  onClick={() => setField('project_address', address)}
                >
                  <MapPin data-icon="inline-start" />
                  <span className="ui-literal">{address}</span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {activeCustomer && typedAddress && !addressOnFile ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          disabled={addressBusy}
          onClick={() => void rememberAddress()}
        >
          {addressBusy
            ? t('Saving…')
            : t('Save this address to {name}', { name: activeCustomer.name })}
        </Button>
      ) : null}
    </div>
  );

  // The client whose details the bill-to matches; null when it has no profile.
  const activeClient = active ? clientForBillTo(clients, active.invoice.bill_to) : null;
  const billToName = active?.invoice.bill_to.name.trim() ?? '';
  // Always the same number of choices while picking: a changing list would
  // lose the pick (see SelectField). Only the first choice's label changes.
  const clientOptions = [
    {
      value: NO_CLIENT,
      label:
        billToName && !activeClient
          ? t('{name} (no client profile)', { name: billToName })
          : t('Choose a client'),
    },
    ...clients.map((client) => ({ value: String(client.id), label: client.name })),
    { value: NEW_CLIENT, label: t('+ Create new client') },
  ];
  const clientChoice = newClient
    ? NEW_CLIENT
    : activeClient
      ? String(activeClient.id)
      : NO_CLIENT;
  const clientDetails = activeClient
    ? [
        activeClient.address_lines.filter((line) => line.trim()).join(', '),
        activeClient.phone && t('Tel: {phone}', { phone: phoneDisplay(activeClient.phone) }),
      ]
        .filter(Boolean)
        .join(' · ') || t('No address or phone on this client profile.')
    : null;

  const newClientField = (
    key: 'name' | 'phone' | 'street' | 'city',
    label: string,
    options: { required?: boolean; type?: string; placeholder?: string } = {},
  ) =>
    newClient ? (
      <div className="ld-field" data-span={2}>
        <label htmlFor={`${fieldId}-new-client-${key}`}>
          {label}
          {options.required ? (
            <span className="ld-required" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </label>
        <Input
          id={`${fieldId}-new-client-${key}`}
          type={options.type ?? 'text'}
          placeholder={options.placeholder}
          value={newClient[key]}
          disabled={newClient.saving}
          onChange={(event) => {
            // The phone box formats as it is typed; the rest take what is typed.
            const value =
              key === 'phone'
                ? phoneEdit(newClient[key], event.target.value)
                : event.target.value;
            setNewClient((current) => current && { ...current, [key]: value });
          }}
          onKeyDown={(event) => {
            // Enter saves the client, not the ticket form around it.
            if (event.key === 'Enter') {
              event.preventDefault();
              void saveNewClient();
            }
          }}
        />
      </div>
    ) : null;
  // The new customer form belongs to the ticket it was opened on.
  const customerFormOpen = newCustomer !== null && newCustomer.itemId === active?.id;
  // The rate is the site's: what this customer is charged where this load went.
  const siteRate = activeCustomer ? rateFor(activeCustomer, ticket?.project_address) : null;
  const customerHint = activeCustomer
    ? siteRate && siteRate.flat_rate !== null
      ? t('Filled in for this address: {rate}.', {
          rate: `${t(RATE_TYPE_LABELS[siteRate.rate_type])} ${money(siteRate.flat_rate)} ${t(RATE_UNITS[siteRate.rate_type])}${
            siteRate.fuel_charge
              ? ` ${t('+ {amount} fuel', { amount: formatFuel(siteRate.fuel_charge, siteRate.fuel_type) })}`
              : ''
          }`,
        })
      : t('No rate is saved for this address.')
    : ticket?.customer_name
      ? t('No customer profile matches this ticket.')
      : null;
  /** What choosing a saved address does to the rate, or why nothing is offered. */
  const siteHint =
    activeCustomer && savedAddresses.length && addressOnFile
      ? siteRate && siteRate.flat_rate !== null
        ? t('Rated at this address: {rate}.', {
            rate: `${money(siteRate.flat_rate)} ${t(RATE_UNITS[siteRate.rate_type])}${
              siteRate.fuel_charge
                ? ` ${t('+ {amount} fuel', { amount: formatFuel(siteRate.fuel_charge, siteRate.fuel_type) })}`
                : ''
            }`,
          })
        : t('No rate is saved for this address.')
      : null;

  // One batch per ticket date, the one added to most recently first, with how
  // many of its tickets nobody has checked yet. This is the pile the invoicing
  // is done from, so it is ordered by when the work happened rather than by
  // the date printed on the paper (see batchesByRecency).
  const allBatches = batchesByRecency(records).map((group) => ({
    ...group,
    waiting: group.items.filter(needsReview).length,
  }));
  // The pile being worked through, not the ledger: the three batches most
  // recently added to, and the undated one whenever it has tickets, since
  // those are waiting on a date. The rest are on Invoices & Tickets.
  const batchesByDate = allBatches.filter(
    (batch, index) => index < RECENT_BATCHES || batch.date === null,
  );

  const STEPS = ['Ticket', 'Customer and job', 'Weight', 'Invoice'];
  const lastStep = STEPS.length - 1;
  const atStep = Math.min(step, lastStep);

  /**
   * Whether the picture beside the form is one a magnifying glass can do
   * anything with: a photograph that has arrived. A PDF is the browser's own
   * viewer, and the other states are a line of text in a box.
   */
  const zoomablePreview =
    !!active &&
    active.preview_status === 'ready' &&
    /^image\/(png|jpe?g|webp|gif)$/.test(active.source.type);

  const batchItems = active
    ? queue.filter((item) => item.batch_id === active.batch_id)
    : [];
  const batchChanged = batchItems.filter(hasChanges);
  const activeChanged = active ? hasChanges(active) : false;
  const batchNote =
    batchItems.length > 1
      ? t(
          'Shared by every ticket on this invoice ({tickets}). Changes to invoice details apply to all of them; rates stay per ticket.',
          { tickets: plural(batchItems.length, 'ticket') },
        )
      : null;

  const check = ticket ? weightCheck(ticket, t) : null;
  const rateType = ticket ? rateTypeOf(ticket) : 'flat';
  const fuelType = ticket ? fuelTypeOf(ticket) : 'flat';
  // Collapsed section headers show the key values of their fields.
  const ticketDetail = ticket
    ? [ticket.ticket_number, date(ticket.ticket_date), ticket.plant_name]
        .filter(Boolean)
        .join(' · ')
    : '';
  const jobDetail = ticket
    ? [ticket.customer_name, ticket.project_name].filter(Boolean).join(' · ')
    : '';
  const tons = ticket ? invoiceTons(ticket) : '';
  /**
   * How many fields of a section are still waiting for a person. Shown on
   * the closed section's own line, because on a phone — and on a desk with
   * the sections folded — the only thing on the screen is that line, and a
   * ticket that cannot be saved must say where the reason for it is.
   */
  const toConfirmIn = (...groups: FieldDef[][]) =>
    groups.flat().filter((def) => {
      const resolution = active?.recovery?.fields[def.name];
      return resolution ? unsettledField(resolution) : false;
    }).length;
  const withConfirm = (detail: string, count: number) =>
    count
      ? [detail, t('{count} to confirm', { count })].filter(Boolean).join(' · ')
      : detail;
  const ticketConfirm = toConfirmIn(TICKET_FIELDS);
  const jobConfirm = toConfirmIn(JOB_FIELDS);
  const weightConfirm = toConfirmIn(WEIGHT_FIELDS, HAULING_FIELDS);
  const weightDetail = ticket
    ? [
        ticket.net_lb === null ? null : pounds(ticket.net_lb),
        tons ? t('{tons} Tons', { tons }) : null,
        ticket.carrier_name,
        check?.tone === 'bad' ? t('Weights do not balance') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  /**
   * Reading a ticket. The bar sits under the Extract button on every screen,
   * phone included: it used to take over the phone's whole screen, which hid
   * the page it was working on and the tickets already waiting on it.
   *
   * A quiet one shows nothing at all: "Review later" means the page stays
   * exactly as it was, ready for the next photograph, and the status line under
   * the button says where the ticket went once it lands.
   */
  const extractionProgress = extraction && !extraction.quiet ? (
    <Progress value={extraction.percent} className="ld-progress">
      <div className="ld-progress-head">
        <ProgressLabel className="ld-progress-label">
          {extraction.total > 1
            ? t('Extracting file {index} of {total}', {
                index: extraction.index + 1,
                total: extraction.total,
              })
            : t('Extracting tickets')}
        </ProgressLabel>
        <ProgressValue className="ld-progress-value" />
      </div>
      <p className="ld-progress-detail">
        {t(extraction.label)} · {extraction.file}
      </p>
    </Progress>
  ) : null;

  const sectionSummary = (title: string, detail: string, tone?: string) => (
    <summary className="ld-section-summary">
      <h3>{t(title)}</h3>
      <span className="ld-section-detail" data-tone={tone}>
        {detail || t('Nothing entered yet')}
      </span>
      <ChevronDown className="ld-section-chevron" aria-hidden="true" />
    </summary>
  );

  /** A required field in a closed section: open it so the browser can point to the field. */
  const openInvalidSection = (event: SyntheticEvent<HTMLFormElement>) => {
    const section = (event.target as HTMLElement).closest('details');
    if (section && !section.open) section.open = true;
  };
  const saveLabel = activeSaved
    ? batchChanged.length
      ? t('Save changes')
      : activeUnchecked
        ? t('Save as checked')
        : t('Saved')
    : queue.some(
          (item, index) =>
            index !== activeIndex && item.saved_record_id === null,
        )
      ? t('Save & review next')
      : t('Save ticket & create invoice');

  // Reads the latest records and queue without re-running the effect below.
  const openEditRequest = useEffectEvent(() => {
    const id = editRequest;
    if (id === null) return;
    setDeskField('editRequest', null);
    const record = records.find((item) => item.id === id);
    if (record) {
      editSaved(record);
    } else {
      toast.add({
        title: t('Ticket not found'),
        description: t('It may have been deleted. Nothing was opened.'),
        type: 'error',
      });
    }
  });
  // Asked for as a request rather than answered on the way in: this page is
  // mounted whether or not it is the one on the screen, so there is no arrival
  // to catch. Invoices & Tickets asks (requestEdit), and this hears it.
  useEffect(() => {
    if (store.ready && editRequest !== null) openEditRequest();
  }, [store.ready, editRequest]);

  // Reloading or closing the tab would lose unsaved changes to saved tickets.
  const unsavedEdits = queue.some(hasChanges);
  useEffect(() => {
    if (!unsavedEdits) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedEdits]);

  /**
   * The way round the other tickets. It heads the panel on a desk as it always
   * has, and on a phone it follows the block the review opens on: it is for
   * reaching the next ticket, not for checking this one.
   *
   * Null until there is a ticket open: this is worked out on every render of
   * the page, including the one where the queue is empty and the review is not
   * on the screen at all, and the summary below reads straight off the ticket.
   */
  /**
   * The tickets the selector steps through: the ones on the invoice being
   * reviewed, and only those. An invoice is what gets sent, so it is the unit
   * being worked through — the count beside the steps is this invoice's tickets,
   * not everything that came off the reader, and a run of three on invoice 20
   * reads "Ticket 2 of 3" rather than "Ticket 2 of 6".
   *
   * The arrows carry on past either end of it (`stepReviewStop`), which is the
   * one place a step lands on another invoice: the invoice details on the panel
   * belong to whichever invoice is open, and crossing over in the middle of a
   * run is what confining the numbered steps avoids.
   */
  const invoiceStops = active
    ? queue.flatMap((item, index) => (item.batch_id === active.batch_id ? [index] : []))
    : [];
  const stopHere = invoiceStops.indexOf(activeIndex);
  const stops = active ? reviewStops(queue, records) : [];
  const previousStop = active ? stepReviewStop(stops, activeIndex, -1) : null;
  const nextStop = active ? stepReviewStop(stops, activeIndex, 1) : null;
  /**
   * Whether the arrows are shown at all. An invoice of one ticket is a run of
   * one, and two arrows either side of it is a way round offered for a journey
   * that does not exist; reviewing it moves on by itself. The numbered steps
   * stay, because they say which ticket is open and how it stands.
   */
  const canStep = invoiceStops.length > 1;

  /**
   * Anything still to be filled in before this ticket is done with — a missing
   * rate included. A rate only keeps the invoice a draft rather than the ticket
   * incomplete, but a draft is not finished either, and a tick beside a ticket
   * that still needs a rate says it is. The same rule the batch list marks
   * "Needs review" by, so a ticket does not read as two different things in two
   * places.
   */
  const missingInformation = (item: QueueItem) =>
    validateTicket(item.ticket, item.recovery).length > 0;

  const queueRow =
    active && ticket ? (
    <>
          <div className="ld-review-head">
            <div>
              <p className="ld-step">{t('02 · Review')}</p>
              <h2 id="ld-review-title">
                {/* This invoice's own run, and which invoice it is: the count
                    used to be every ticket of the upload, so a ticket on the
                    second of three invoices read as one of six. */}
                {shownInvoiceNumber(active.invoice.invoice_number)
                  ? t('Invoice {number} · Ticket {index} of {total}', {
                      number: shownInvoiceNumber(active.invoice.invoice_number),
                      index: stopHere + 1,
                      total: invoiceStops.length,
                    })
                  : t('Ticket {index} of {total}', {
                      index: stopHere + 1,
                      total: invoiceStops.length,
                    })}
              </h2>
            </div>
            <nav className="ld-queue" aria-label={t('Ticket queue')}>
              {canStep ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ld-queue-step"
                  data-step="previous"
                  aria-label={t('Previous ticket')}
                  disabled={previousStop === null}
                  onClick={() => previousStop !== null && setActiveIndex(previousStop)}
                >
                  <ChevronLeft />
                </Button>
              ) : null}
              {queue.map((item, index) => {
                const changed = hasChanges(item);
                const saved = item.saved_record_id !== null && !changed;
                const incomplete = missingInformation(item);
                const elsewhere = item.batch_id !== active.batch_id;
                // A cross for a ticket still missing something, a tick for one
                // saved and whole, and its number until it is either.
                const mark = incomplete ? (
                  <X aria-hidden="true" />
                ) : saved ? (
                  <Check aria-hidden="true" />
                ) : (
                  index + 1
                );
                const state = incomplete
                  ? `, ${t('missing information')}`
                  : saved
                    ? `, ${t('saved')}`
                    : changed
                      ? `, ${t('unsaved changes')}`
                      : '';
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="ld-queue-tab"
                    aria-current={index === activeIndex ? 'true' : undefined}
                    data-saved={saved}
                    data-changed={changed}
                    data-incomplete={incomplete || undefined}
                    disabled={elsewhere}
                    title={elsewhere ? t('On another invoice') : undefined}
                    aria-label={`${t('Ticket {index}: {name}', { index: index + 1, name: item.source.file_name })}${state}${elsewhere ? `, ${t('on another invoice')}` : ''}`}
                    onClick={() => setActiveIndex(index)}
                  >
                    {mark}
                  </button>
                );
              })}
              {canStep ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ld-queue-step"
                  data-step="next"
                  aria-label={t('Next ticket')}
                  disabled={nextStop === null}
                  onClick={() => nextStop !== null && setActiveIndex(nextStop)}
                >
                  <ChevronRight />
                </Button>
              ) : null}
              <span className="ld-queue-count">
                {t('{saved} of {total} saved', { saved: savedInQueue, total: queue.length })}
              </span>
              {savedInQueue === queue.length && !unsavedEdits ? (
                <Button variant="secondary" size="sm" onClick={clearQueue}>
                  {t('Clear queue')}
                </Button>
              ) : null}
            </nav>
          </div>

          <dl className="ld-summary">
            <div>
              <dt>{t('Ticket')}</dt>
              <dd>{ticket.ticket_number ?? t('Not found')}</dd>
            </div>
            <div>
              <dt>{t('Customer')}</dt>
              <dd>{ticket.customer_name ?? t('Not found')}</dd>
            </div>
            <div>
              <dt>{t('Net tons')}</dt>
              <dd>{tons ? t('{tons} Tons', { tons }) : t('Not found')}</dd>
            </div>
            <div>
              <dt>{t('Status')}</dt>
              <dd>
                {activeSaved
                  ? activeChanged
                    ? t('Unsaved changes')
                    : t('Saved')
                  : issues.length
                    ? t('To review: {items}', { items: plural(issues.length, 'item') })
                    : t('Ready to save')}
              </dd>
            </div>
          </dl>
    </>
    ) : null;

  /**
   * What the ticket still needs, or that it needs nothing. The phone keeps it
   * in the block the review opens on; the desk keeps it at the head of the
   * form, where it has always been.
   */
  const checkRow = (
          <div className="ld-check-row">
            <div
              className="ld-notice"
              data-tone={issues.length ? 'warning' : 'good'}
              aria-live="polite"
            >
              {issues.length ? (
                <>
                  <strong>{t('Check before saving')}</strong>
                  <ul>
                    {issues.map((issue) => (
                      <li key={issue}>{t(issue)}</li>
                    ))}
                  </ul>
                </>
              ) : isPhone ? (
                <>
                  <Check aria-hidden="true" />
                  {t('All checks pass')}
                </>
              ) : (
                t('All checks pass.')
              )}
            </div>
            {/* And a tap away from every step, rather than a scroll to
                the bottom of the form. Only on a phone: a desk has the
                photograph standing beside the form already (.ld-aside), so the
                button would open what is on the screen anyway. */}
            {isPhone ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="ld-view-ticket"
                onClick={() => setViewingTicket(true)}
              >
                <FileSearch data-icon="inline-start" />
                {t('View ticket')}
              </Button>
            ) : null}
          </div>
  );

  /**
   * On a phone the review takes the blue band at the top of the page for its
   * own head: which ticket, how it stands, which step, the checks and the way
   * to the picture. The page's own title and figures are a screenful the
   * review has no use for, and the page they belong to is one tap back.
   */
  const phoneReview = isPhone && !!active && !!ticket && !!check;
  /**
   * Every step opens at the top of the page, where the band is. The foot of
   * the step before is not where the next one starts: what a step opens on is
   * which ticket this is, how far through it you are and what it still needs.
   * Only on a phone — a desk has the whole review on one screen.
   */
  useEffect(() => {
    if (!phoneReview) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phoneReview, atStep, activeIndex]);

  const reviewBand = phoneReview ? (
    <div className="ld-review-band">
      <div className="ld-mobile-head">
        <div className="ld-mobile-head-top">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveIndex(-1)}
          >
            <ChevronLeft data-icon="inline-start" />
            {t('Tickets')}
          </Button>
          <strong>{t('Review')}</strong>
        </div>
        <div className="ld-mobile-head-row">
          <strong>
            {t('Ticket {index} of {total}', {
              index: activeIndex + 1,
              total: queue.length,
            })}
          </strong>
          <span
            className="ld-chip"
            data-tone={
              activeChanged
                ? 'warning'
                : activeSaved && !activeUnchecked
                  ? 'good'
                  : undefined
            }
          >
            {activeChanged ? (
              t('Unsaved')
            ) : activeSaved && !activeUnchecked ? (
              <>
                <Check aria-hidden="true" />
                {t('Saved')}
              </>
            ) : (
              t('To check')
            )}
          </span>
          {savedInQueue === queue.length && !unsavedEdits ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('Clear queue')}
              title={t('Clear queue')}
              onClick={clearQueue}
            >
              <X />
            </Button>
          ) : null}
        </div>
        <p className="ld-mobile-step">
          {t('Step {number} of {total}', {
            number: atStep + 1,
            total: STEPS.length,
          })}{' '}
          · {t(STEPS[atStep])}
        </p>
        <span className="ld-steps-track" aria-hidden="true">
          {STEPS.map((name, index) => (
            <i key={name} data-done={index <= atStep || undefined} />
          ))}
        </span>
      </div>

      {checkRow}
      {queueRow}
    </div>
  ) : null;

  return (
    <>
      {/* The band every page opens on. While a ticket is being checked on a
          phone it carries the review's head instead of this page's title and
          figures: what the band is for is saying where you are, and where you
          are is inside one ticket. */}
      <div className="page-heading" data-review={phoneReview || undefined}>
        {reviewBand ?? (
          <>
            <div>
              <p className="eyebrow">LOAD DESK</p>
              <h1>{t('Load Tickets to Invoices')}</h1>
              <p className="muted">
                {t(
                  'Upload tickets, check the extracted fields, then save each one with its original and an invoice.',
                )}
              </p>
            </div>
            <dl className="ld-stats">
              <div>
                <dt>{t('Saved tickets')}</dt>
                <dd>{records.length}</dd>
              </div>
              <div>
                <dt>{t('Needs review')}</dt>
                <dd>{reviewCount}</dd>
              </div>
              <div>
                <dt>{t('Net tons')}</dt>
                <dd>{netTons.toFixed(2)}</dd>
              </div>
            </dl>
          </>
        )}
      </div>

      {/* Everything below the band rides in one sheet, as on every page. On a
          phone it is the panel that slides up over the band; on a wider screen
          it is display:contents and lays out as if it were not here. */}
      <div className="page-sheet">

        <div className="ld-grid">
          <section
            ref={scanPanel}
            className="ld-panel"
            aria-labelledby="ld-upload-title"
          >
            <div className="ld-panel-head">
              <div>
                <p className="ld-step">{t('01 · Upload')}</p>
                <h2 id="ld-upload-title">{t('New Load Tickets')}</h2>
              </div>
              <span className="ld-hint">
                {t('PDF, image or text · 20 MB each')}
              </span>
            </div>
            {/* The camera scanner is for phones; everything else uploads files. */}
            {isPhone ? (
              <>
                {scannerOpen && (
                  <DocumentScanner
                    onClose={closeScanner}
                    onUse={(file) => {
                      chooseFiles([file]);
                      closeScanner();
                    }}
                  />
                )}
                <Button
                  type="button"
                  className="ld-scan-button"
                  onClick={() => setScannerOpen(true)}
                >
                  <Camera data-icon="inline-start" />
                  {t('Scan ticket')}
                </Button>
              </>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              multiple
              hidden
              onChange={(event) => chooseFiles(event.target.files)}
            />
            <button
              type="button"
              className="ld-drop"
              data-phone-hidden={isPhone || undefined}
              data-dragging={dragging}
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="ld-drop-icon" aria-hidden="true">
                <FileUp />
              </span>
              <strong>
                {pending.length ? t('Add more tickets') : t('Drop tickets here')}
              </strong>
              <span>
                {busy
                  ? t('Files added now wait for the next extraction')
                  : pending.length
                    ? t('Drop or click to add files to the list below')
                    : t('or click to choose one or several files')}
              </span>
            </button>
            {pending.length ? (
              <div className="ld-pending" aria-live="polite">
                <div className="ld-pending-head">
                  <strong>
                    {t('Ready to extract: {files}', { files: plural(pending.length, 'file') })}
                  </strong>
                  <Button variant="ghost" size="xs" onClick={() => setPending([])}>
                    {t('Clear')}
                  </Button>
                </div>
                <ul>
                  {pending.map((file) => (
                    <li key={fileKey(file)}>
                      <FileText aria-hidden="true" />
                      <span className="ld-pending-name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="ld-pending-size">{fileSize(file.size)}</span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('Remove {name}', { name: file.name })}
                        onClick={() => removePending(fileKey(file))}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="ld-field ld-truck-pick">
              <label htmlFor={`${fieldId}-upload-truck`}>
                {t('Truck for these tickets')}
              </label>
              <SelectField
                id={`${fieldId}-upload-truck`}
                aria-describedby={`${fieldId}-upload-truck-hint`}
                value={uploadTruck ? String(uploadTruck.id) : ''}
                disabled={busy}
                onValueChange={(value) => setTruckChoice(value === '' ? NO_TRUCK : value)}
                options={[
                  { value: '', label: t('No truck profile') },
                  ...activeTrucks.map((truck) => ({
                    value: String(truck.id),
                    label: `${truckLabel(truck)}${truck.driver ? ` · ${truck.driver}` : ''}`,
                  })),
                ]}
              />
              <small
                id={`${fieldId}-upload-truck-hint`}
                className="ld-field-hint"
              >
                {activeTrucks.length ? null : (
                  <>
                    {t('Add trucks in')} <Link href="/fleet">{t('Truck Fleet')}</Link>{' '}
                    {t('to choose one here.')}
                  </>
                )}
              </small>
            </div>
            <div className="ld-actions">
              {/* Read, checked, filed and invoiced: nothing opens unless
                  something is left to ask, and what is left is asked once
                  per job in the panel below. Beside a truck that is the whole
                  job; at a desk the second button opens the review as well,
                  for a look at every ticket. */}
              <Button
                onClick={() => void extractPending()}
                disabled={busy || !pending.length}
              >
                {t('Process tickets')}
                <ChevronRight data-icon="inline-end" />
              </Button>
              {isPhone ? null : (
                <Button
                  variant="secondary"
                  onClick={() => void extractPending(true)}
                  disabled={busy || !pending.length}
                >
                  <Clock data-icon="inline-start" />
                  {t('Process and review')}
                </Button>
              )}
            </div>
            {addingTo ? null : extractionProgress}
            <p
              className="ld-status"
              data-tone={uploadStatus?.tone}
              aria-live="polite"
            >
              {uploadLine}
              {isPhone && liveReview && uploadLine?.startsWith('✓')
                ? ` · ${t('Please review')}: ${liveReview}`
                : ''}
            </p>
            {uploadReceipt && !busy ? (
              <UploadReceiptList
                receipt={uploadReceipt}
                records={[...records, ...held]}
                onOpenRecord={(id) =>
                  held.some((record) => record.id === id)
                    ? duplicatesPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    : setDeskField('editRequest', id)
                }
                onDismiss={() => {
                  setDeskField('uploadReceipt', null);
                  // The line was the receipt's own; it goes with it.
                  if (uploadStatus?.live) setUploadStatus(null);
                }}
              />
            ) : null}
          </section>

          {/* The questions the scans left, one per job. A ticket the evidence
              settled is not here; it is on its invoice already. What is here
              is answered once and applied to every ticket it covers, and the
              review screen is only for a ticket with a question of its own. */}
          {/* The right-hand column: what is left to answer, and under it the
              batches. One column, so the batches sit under the questions on a
              desk rather than being pushed under the upload by them. */}
          <div className="ld-side">
          {/* Pages whose ticket number is already on file, kept and held off
              every invoice until somebody has compared the two pictures. */}
          <DuplicateReviewPanel ref={duplicatesPanel} held={held} records={records} />
          {exceptions.length ? (
            <section className="ld-panel ld-exceptions" aria-labelledby="ld-input-title" ref={exceptionsPanel}>
              <div className="ld-panel-head">
                <div>
                  <p className="ld-step">{t('Answer once')}</p>
                  <h2 id="ld-input-title">{t('Needs your input')}</h2>
                </div>
              </div>
              <ul className="ld-exception-list">
                {exceptions.map((group) => {
                  const individual = group.type === 'INDIVIDUAL_CRITICAL_FIELD';
                  const record = individual ? records.find((item) => item.id === group.ticketIds[0]) : null;
                  const asksCustomer = group.asks.includes('customer_name') || group.customerProfileId === null;
                  const chosenCustomer = answerFor(group, 'customer_profile');
                  const error = groupError[group.key];
                  return (
                    <li key={group.key} className="ld-exception" data-kind={individual ? 'ticket' : 'group'}>
                      <div className="ld-exception-head">
                        <strong>{t(EXCEPTION_TITLES[group.type])}</strong>
                        <span>
                          {individual
                            ? [record?.ticket.ticket_number ? t('Ticket {number}', { number: record.ticket.ticket_number }) : t('Unnumbered ticket'), record?.ticket.ticket_date ? date(record.ticket.ticket_date) : null]
                                .filter(Boolean)
                                .join(' · ')
                            : [group.customer ?? t('Customer not read'), t('{tickets}', { tickets: plural(group.ticketIds.length, 'ticket') })].join(' · ')}
                        </span>
                      </div>
                      {individual ? (
                        <>
                          <p className="ld-exception-why">
                            {group.needsDate
                              ? t('No date could be read. Enter it from the ticket; it then goes on that day’s invoice.')
                              : group.asks.length
                                ? t('Not settled: {fields}.', {
                                    fields: group.asks.map((field) => t(ASK_LABELS[field] ?? field.replace(/_/g, ' '))).join(', '),
                                  })
                                : t(group.reasons[0] ?? 'This ticket has not been looked at.')}
                          </p>
                          {group.needsDate ? (
                            <div className="ld-fields ld-exception-fields">
                              <div className="ld-field" data-span={2}>
                                <label htmlFor={`${fieldId}-${group.key}-date`}>{t('Date')}</label>
                                <Input
                                  id={`${fieldId}-${group.key}-date`}
                                  type="date"
                                  value={groupAnswers[group.key]?.ticket_date ?? ''}
                                  onChange={(event) => setAnswer(group, 'ticket_date', event.target.value)}
                                />
                              </div>
                            </div>
                          ) : null}
                          {error ? <p className="ld-status" data-tone="error">{error}</p> : null}
                          <div className="ld-confirm-actions">
                            {group.needsDate ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={groupBusy !== null}
                                onClick={() => void saveDate(group)}
                              >
                                {groupBusy === group.key ? t('Saving…') : t('Save date')}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant={group.needsDate ? 'secondary' : 'default'}
                              onClick={() => record && (isPhone ? openTicketPicture(record) : editSaved(record))}
                            >
                              {isPhone ? t('Open ticket') : t('Open in review')}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          {group.reasons[0] ? <p className="ld-exception-why">{t(group.reasons[0])}</p> : null}
                          {Object.keys(group.detected).length ? (
                            <dl className="ld-exception-detected">
                              {(Object.entries(group.detected) as [keyof Ticket, string][]).map(([field, value]) => (
                                <div key={field}>
                                  <dt>{t(ASK_LABELS[field] ?? field.replace(/_/g, ' '))}</dt>
                                  <dd className="ui-literal">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                          <p className="ld-field-hint">
                            {t('{agree} of {tickets} read this whole.', {
                              agree: Math.round(group.confidence * group.ticketIds.length),
                              tickets: plural(group.ticketIds.length, 'ticket'),
                            })}
                          </p>
                          <div className="ld-fields ld-exception-fields">
                            {asksCustomer ? (
                              <div className="ld-field" data-span={2}>
                                <label htmlFor={`${fieldId}-${group.key}-customer`}>{t('Customer')}</label>
                                <SelectField
                                  id={`${fieldId}-${group.key}-customer`}
                                  value={chosenCustomer}
                                  onValueChange={(value) => setAnswer(group, 'customer_profile', value)}
                                  options={[
                                    ...customers.map((customer) => ({ value: String(customer.id), label: customer.name })),
                                    {
                                      value: NEW_CUSTOMER,
                                      label: group.customer
                                        ? t('+ New customer: {name}', { name: group.customer })
                                        : t('+ New customer'),
                                    },
                                  ]}
                                />
                                {chosenCustomer === NEW_CUSTOMER ? (
                                  <Input
                                    aria-label={t('Customer name')}
                                    value={answerFor(group, 'customer_name') || group.customer || ''}
                                    onChange={(event) => setAnswer(group, 'customer_name', event.target.value)}
                                  />
                                ) : null}
                              </div>
                            ) : null}
                            {group.asks
                              .filter((field) => field !== 'customer_name')
                              .map((field) => (
                                <div key={field} className="ld-field" data-span={2}>
                                  <label htmlFor={`${fieldId}-${group.key}-${field}`}>
                                    {t(ASK_LABELS[field] ?? field.replace(/_/g, ' '))}
                                  </label>
                                  <Input
                                    id={`${fieldId}-${group.key}-${field}`}
                                    value={answerFor(group, field)}
                                    onChange={(event) => setAnswer(group, field, event.target.value)}
                                  />
                                  {group.candidates[field]?.length ? (
                                    <span className="ld-confirm-actions">
                                      {group.candidates[field]!.map((candidate) => (
                                        <Button
                                          key={candidate}
                                          type="button"
                                          variant="secondary"
                                          size="xs"
                                          onClick={() => setAnswer(group, field, candidate)}
                                        >
                                          <span className="ui-literal">{candidate}</span>
                                        </Button>
                                      ))}
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                          </div>
                          {(answerFor(group, 'project_address') || group.detected.project_address) ? (
                            <p className="ld-field-hint">
                              {answerFor(group, SAVE_ADDRESS) === 'no'
                                ? t('The job site will not be saved to the customer.')
                                : t('The job site will be saved to the customer, to pick on the next ticket.')}{' '}
                              <Button
                                type="button"
                                variant="link"
                                size="xs"
                                onClick={() =>
                                  setAnswer(group, SAVE_ADDRESS, answerFor(group, SAVE_ADDRESS) === 'no' ? 'yes' : 'no')
                                }
                              >
                                {answerFor(group, SAVE_ADDRESS) === 'no' ? t('Save it after all') : t('Don’t save it')}
                              </Button>
                            </p>
                          ) : null}
                          {error ? (
                            <p className="ld-status" data-tone="error">{error}</p>
                          ) : null}
                          <div className="ld-confirm-actions">
                            <Button
                              type="button"
                              size="sm"
                              disabled={groupBusy !== null}
                              onClick={() => void confirmGroup(group)}
                            >
                              {groupBusy === group.key
                                ? t('Saving…')
                                : t('Confirm for all {tickets}', { tickets: plural(group.ticketIds.length, 'ticket') })}
                            </Button>
                            {asksCustomer && chosenCustomer === NEW_CUSTOMER ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={groupBusy !== null}
                                onClick={() => void fileWithoutProfile(group)}
                              >
                                {t('Don’t create a customer')}
                              </Button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="ld-panel" aria-labelledby="ld-saved-title">
            <div className="ld-panel-head">
              <div>
                <p className="ld-step">{t('By ticket date')}</p>
                <h2 id="ld-saved-title">{t('Batches')}</h2>
              </div>
              <div className="ld-actions ld-actions-flush">
                <Link
                  href="/records"
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  {t('All invoices & tickets')}
                </Link>
                <Button
                  className="ld-ledger-csv"
                  variant="secondary"
                  size="sm"
                  onClick={downloadLedger}
                  disabled={!records.length}
                >
                  <Download />
                  {t('Ledger CSV')}
                </Button>
              </div>
            </div>
            {store.error ? (
              <div className="ld-notice" data-tone="warning">
                {t(store.error)}{' '}
                {store.error.includes('could not be read') ? (
                  <Button
                    variant="link"
                    size="xs"
                    onClick={clearUnreadableRecords}
                  >
                    {t('Clear saved tickets')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {!store.ready ? (
              <p className="ld-empty">{t('Loading batches…')}</p>
            ) : records.length === 0 ? (
              <p className="ld-empty">
                {store.mode === 'local'
                  ? t('Nothing photographed yet. In this local preview batches stay in this browser.')
                  : t('Nothing photographed yet. A ticket goes into its date’s batch as soon as it is read.')}
              </p>
            ) : (
              batchesByDate.map((batch) => (
              <section key={batch.date ?? 'undated'} className="ld-batch">
                <div className="ld-batch-head">
                  <strong>{batch.date ? date(batch.date) : t('Date not found')}</strong>
                  <span>
                    {plural(batch.items.length, 'ticket')}
                    {batch.waiting
                      ? ` · ${t('{count} to check', { count: batch.waiting })}`
                      : ` · ${t('all checked')}`}
                  </span>
                </div>
              {/* One line per invoice, not per ticket: the invoice is what is
                  sent, and a batch is nearly always one of them. Edit opens
                  every ticket on it in review, starting from the first one
                  nobody has checked. The tickets themselves are listed on
                  Invoices & Tickets. */}
              <ul className="ld-records">
                {invoiceGroups(batch.items)
                  .sort((a, b) => Math.min(...a.records.map((r) => r.id)) - Math.min(...b.records.map((r) => r.id)))
                  .map((group) => {
                    const first = group.records[0]!;
                    const waiting = group.records.filter(needsReview).length;
                    const incomplete = group.records.some(
                      (record) => validateTicket(record.ticket, record.recovery).length > 0,
                    );
                    const number = shownInvoiceNumber(group.invoice.invoice_number);
                    const customers = [
                      ...new Set(
                        group.records
                          .map((record) => record.ticket.customer_name?.trim())
                          .filter((name): name is string => Boolean(name)),
                      ),
                    ];
                    return (
                      <li key={group.key} className="ld-record">
                        <div className="ld-record-main">
                          <strong>
                            {number
                              ? t('Invoice {number}', { number })
                              : isUndatedBatch(recordBatch(first))
                                ? t('Date not found · no invoice yet')
                                : t('Waiting for the rest of this upload')}
                          </strong>
                          <span className="ld-record-meta">
                            {plural(group.records.length, 'ticket')} ·{' '}
                            {customers.length ? customers.join(', ') : t('No customer')} ·{' '}
                            {t('{tons} tons', { tons: group.tons.toFixed(2) })} ·{' '}
                            <span>
                              {group.needsRate
                                ? t('Needs a rate')
                                : money(group.total)}
                            </span>
                          </span>
                        </div>
                        <span
                          className="ld-chip"
                          data-tone={waiting || incomplete ? 'warning' : 'good'}
                        >
                          {waiting
                            ? t('{count} to check', { count: waiting })
                            : incomplete
                              ? t('Needs review')
                              : t('All checked')}
                        </span>
                        <div className="ld-record-actions">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => editSaved(group.records.find(needsReview) ?? first)}
                          >
                            <Pencil />
                            {t('Edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setInvoiceView(savedInvoice(first))}
                          >
                            <ReceiptText />
                            {t('Invoice')}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
              </section>
              ))
            )}
          </section>
          </div>
        </div>

        {active && ticket && check ? (
          <section
            ref={reviewPanel}
            className="ld-panel ld-review"
            aria-labelledby="ld-review-title"
          >
            {/* On a phone the head of the review and the way round the other
                tickets are both up in the band (see reviewBand); a desk has
                room for the ticket and its photograph at once and keeps the
                review it always had. */}
            {isPhone ? null : queueRow}

            <div className="ld-review-body">
              <form
                className="ld-form"
                onSubmit={(event) => void saveActive(event)}
                onInvalidCapture={openInvalidSection}
              >
                {/* What the reader made of this page. Until now this was worked
                    out, stored on the ticket and never shown, so a ticket that
                    came back empty — an unsupported supplier's layout, a page
                    nothing could be read from — looked like the app doing
                    nothing at all. */}
                {active.note_problem ? (
                  <div className="ld-notice" data-tone="warning" aria-live="polite">
                    <strong>
                      {active.recovery && cameraCropFields(active.recovery).length
                        ? t('Part of this ticket was not in the picture')
                        : t('This ticket was not read')}
                    </strong>
                    <p>{t(active.note)}</p>
                    <details className="ld-scan-text">
                      <summary>{t('What the scan read')}</summary>
                      {active.ocr_text.trim() ? (
                        <>
                          <pre>{active.ocr_text}</pre>
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            onClick={() => void navigator.clipboard?.writeText(active.ocr_text)}
                          >
                            {t('Copy text')}
                          </Button>
                        </>
                      ) : (
                        <p>{t('Nothing at all. The page itself is the problem, not the layout.')}</p>
                      )}
                    </details>
                  </div>
                ) : null}
                {isPhone ? null : checkRow}

                <fieldset
                  className="ld-fieldset"
                  disabled={busy}
                  data-phone-step={isPhone ? atStep : undefined}
                >
                  <details className="ld-section ld-collapsible" data-step="0" open={isPhone || undefined}>
                    {sectionSummary(
                      'Ticket',
                      withConfirm(ticketDetail, ticketConfirm),
                      ticketConfirm ? 'bad' : undefined,
                    )}
                    <div className="ld-fields">
                      {/* No day came off the scan, so this ticket is on no
                          invoice. The date is what puts it on one. Two ways
                          to get here and they read differently to whoever is
                          looking: an empty date box, and a box holding what
                          the reader made of a line it could not manage. The
                          second is worth quoting back, because the thing to
                          do is compare it with the picture. */}
                      {isUndatedBatch(active.batch_id) && !ticketDay(active.ticket.ticket_date) ? (
                        <p className="ld-weight" data-tone="bad" role="alert">
                          {isUnreadableDate(active.ticket.ticket_date)
                            ? t(
                                'The date read off this ticket, “{date}”, is not a day on the calendar. Check it against the original and correct it below; the ticket then goes on that day’s invoice.',
                                { date: active.ticket.ticket_date!.trim() },
                              )
                            : t(
                                'No date was detected on this ticket. Read it off the original and enter it below; the ticket then goes on that day’s invoice.',
                              )}
                        </p>
                      ) : null}
                      {renderFields(TICKET_FIELDS)}
                    </div>
                  </details>

                  <details className="ld-section ld-collapsible" data-step="1" open={isPhone || undefined}>
                    {sectionSummary(
                      'Customer and Job',
                      withConfirm(jobDetail, jobConfirm),
                      jobConfirm ? 'bad' : undefined,
                    )}
                    <div className="ld-fields">
                      {renderFields(JOB_FIELDS, (def) =>
                        def.name === 'project_address' ? addressPicker : undefined,
                      )}
                    </div>
                  </details>

                  <details className="ld-section ld-collapsible" data-step="2" open={isPhone || undefined}>
                    {sectionSummary(
                      'Weight and Hauling',
                      withConfirm(weightDetail, weightConfirm),
                      check.tone === 'bad' || weightConfirm ? 'bad' : undefined,
                    )}
                    <div className="ld-fields">
                      {renderFields(WEIGHT_FIELDS)}
                      <p
                        className="ld-weight"
                        data-tone={check.tone}
                        aria-live="polite"
                      >
                        {check.text}
                      </p>
                      {renderFields(HAULING_FIELDS)}
                    </div>
                  </details>

                  <div className="ld-section" data-step="3">
                    <h3>{t('Invoice')}</h3>
                    {batchNote ? (
                      <p className="ld-section-note">{batchNote}</p>
                    ) : null}
                    <div className="ld-add-tickets">
                      <input
                        ref={addFileInput}
                        type="file"
                        accept={ACCEPT_ATTRIBUTE}
                        multiple
                        hidden
                        onChange={(event) => void addTicketsToInvoice(event.target.files)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => addFileInput.current?.click()}
                      >
                        <FileUp data-icon="inline-start" />
                        {t('Add tickets to this invoice')}
                      </Button>
                      {addingTo === active.batch_id ? extractionProgress : null}
                    </div>
                    <div className="ld-fields">
                      {invoiceField(
                        t('Invoice number'),
                        // Never the waiting mark: it is bookkeeping, not a
                        // number, and not the one this invoice will carry.
                        shownInvoiceNumber(active.invoice.invoice_number),
                        (value) => setInvoice({ invoice_number: value }),
                        {
                          // A ticket with no date has no number to give yet;
                          // the date, entered in step 1, is what earns it one
                          // on save. Requiring a number here would stop that
                          // save at the very field it is about to fill.
                          required: !isUndatedBatch(active.batch_id),
                          placeholder: t('e.g. 1001'),
                          hint: shownInvoiceNumber(active.invoice.invoice_number)
                            ? undefined
                            : isUndatedBatch(active.batch_id)
                              ? t('Given once the ticket has a date: enter it in step 1.')
                              : isPendingInvoiceNumber(active.invoice.invoice_number)
                                ? t('Waiting for the rest of this upload to be read.')
                                : undefined,
                        },
                      )}
                      {/* Read-only on purpose: an invoice is dated by its
                          ticket, so this follows the date in step 1 rather
                          than being a second date to keep in step with it. A
                          plain box, not a date picker, so it matches the
                          fields around it instead of whatever control the
                          phone draws for type="date". */}
                      {invoiceField(
                        t('Invoice date'),
                        ticketDay(active.ticket.ticket_date)
                          ? date(active.ticket.ticket_date!)
                          : date(active.invoice.invoice_date),
                        () => {},
                        {
                          readOnly: true,
                          hint: undefined,
                        },
                      )}
                      <div className="ld-field" data-span={2} data-new-row>
                        <label htmlFor={`${fieldId}-customer`}>
                          {t('Customer profile')}
                        </label>
                        <SelectField
                          key={`customer-${activeIndex}-${customers.length}`}
                          id={`${fieldId}-customer`}
                          aria-describedby={`${fieldId}-customer-hint`}
                          value={
                            customerFormOpen
                              ? NEW_CUSTOMER
                              : activeCustomer
                                ? String(activeCustomer.id)
                                : ''
                          }
                          onValueChange={chooseCustomer}
                          disabled={customerFormOpen && newCustomer.saving}
                          options={[
                            { value: '', label: t('No customer profile') },
                            ...customers.map((customer) => ({
                              value: String(customer.id),
                              label: customer.name,
                            })),
                            { value: NEW_CUSTOMER, label: t('+ Create new customer') },
                          ]}
                        />
                        {customerFormOpen || !customerHint ? null : (
                          <small
                            id={`${fieldId}-customer-hint`}
                            className="ld-field-hint"
                          >
                            {customerHint}
                          </small>
                        )}
                        {misprint ? (
                          <p className="ld-near-match">
                            <span>
                              {t('The ticket prints “{printed}”, a letter or two off {name}.', {
                                printed: printedName,
                                name: misprint.alias ?? misprint.customer.name,
                              })}
                            </span>
                            <Button
                              type="button"
                              variant="link"
                              size="xs"
                              disabled={rememberBusy}
                              onClick={() => void rememberSpelling()}
                            >
                              {rememberBusy ? t('Saving…') : t('Remember this spelling')}
                            </Button>
                          </p>
                        ) : null}
                      </div>
                      {customerFormOpen ? (
                        <fieldset
                          className="ld-new-client"
                          aria-labelledby={`${fieldId}-new-customer-title`}
                        >
                          <p
                            id={`${fieldId}-new-customer-title`}
                            className="ld-new-client-title"
                          >
                            {t('New customer')}
                          </p>
                          <div className="ld-fields">
                            <div className="ld-field" data-span={2}>
                              <label htmlFor={`${fieldId}-new-customer-name`}>
                                {t('Customer name')}
                                <span className="ld-required" aria-hidden="true">
                                  {' '}
                                  *
                                </span>
                              </label>
                              <Input
                                ref={newCustomerInput}
                                id={`${fieldId}-new-customer-name`}
                                aria-describedby={`${fieldId}-new-customer-hint`}
                                value={newCustomer.name}
                                disabled={newCustomer.saving}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setNewCustomer(
                                    (current) => current && { ...current, name: value, error: null },
                                  );
                                }}
                                onKeyDown={(event) => {
                                  // Enter saves the customer, not the ticket form around it.
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void saveNewCustomer();
                                  }
                                }}
                              />
                              <small
                                id={`${fieldId}-new-customer-hint`}
                                className="ld-field-hint"
                              >
                                {[
                                  ticket.customer_name &&
                                    t('Scanned as {name}', { name: ticket.customer_name }),
                                  ticket.customer_id &&
                                    t('customer number {number}', { number: ticket.customer_id }),
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                                .{' '}
                                {t('Tickets with the scanned name or number will match this customer.')}
                              </small>
                            </div>
                          </div>
                          {newCustomer.error ? (
                            <p className="ld-status" data-tone="error" role="alert">
                              {t(newCustomer.error)}
                            </p>
                          ) : null}
                          <div className="ld-actions ld-actions-flush">
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={newCustomer.saving}
                              onClick={() => setNewCustomer(null)}
                            >
                              {t('Cancel')}
                            </Button>
                            <Button
                              type="button"
                              disabled={newCustomer.saving}
                              onClick={() => void saveNewCustomer()}
                            >
                              {newCustomer.saving ? t('Saving…') : t('Save customer')}
                            </Button>
                          </div>
                        </fieldset>
                      ) : null}
                      {/* Where this load went, from the customer's saved job
                          sites. It is the ticket's destination (step 1) offered
                          as a list, and choosing one brings that site's rate
                          with it. The truck used to be picked here; it is set
                          for the upload in the panel above instead. */}
                      <div className="ld-field" data-span={2}>
                        <label htmlFor={`${fieldId}-site`}>{t('Saved address')}</label>
                        <SelectField
                          id={`${fieldId}-site`}
                          aria-describedby={`${fieldId}-site-hint`}
                          value={savedAddresses.find(sameAddress) ?? ''}
                          onValueChange={(value) => {
                            if (value) setField('project_address', value);
                          }}
                          disabled={!activeCustomer || !savedAddresses.length}
                          // Addresses run long: the list is wider than the
                          // column and wraps, and while the ticket's address is
                          // none of them the trigger says so rather than the
                          // list offering "none" as something to pick.
                          wide
                          placeholder={
                            !activeCustomer
                              ? t('Choose a customer first')
                              : !savedAddresses.length
                                ? t('No saved addresses for this customer')
                                : typedAddress
                                  ? t('Not one of the saved addresses')
                                  : t('Choose an address')
                          }
                          options={savedAddresses.map((address) => ({
                            value: address,
                            label: address,
                          }))}
                        />
                        {siteHint ? (
                          <small
                            id={`${fieldId}-site-hint`}
                            className="ld-field-hint"
                          >
                            {siteHint}
                          </small>
                        ) : null}
                      </div>
                      {/* Rate type, rate, fuel type and fuel charge share a row,
                          and an hourly rate puts its hours at the end of it: the
                          hours are part of what the line is worked out from, so
                          they come before the total rather than after it. */}
                      <div className="ld-field" data-new-row>
                        <label htmlFor={`${fieldId}-rate-type`}>{t('Rate type')}</label>
                        <SelectField
                          key={`rate-type-${activeIndex}`}
                          id={`${fieldId}-rate-type`}
                          value={rateType}
                          onValueChange={(value) => setField('rate_type', value)}
                          options={RATE_TYPES.map((type) => ({
                            value: type,
                            label: t(RATE_TYPE_LABELS[type]),
                          }))}
                        />
                      </div>
                      {renderField({
                        name: 'rate',
                        label: t('Rate {unit}', { unit: t(RATE_UNITS[rateType]) }),
                        step: '0.01',
                      })}
                      <div className="ld-field">
                        <label htmlFor={`${fieldId}-fuel-type`}>{t('Fuel charge type')}</label>
                        <SelectField
                          key={`fuel-type-${activeIndex}`}
                          id={`${fieldId}-fuel-type`}
                          value={fuelType}
                          onValueChange={(value) => setField('fuel_type', value)}
                          options={FUEL_TYPES.map((type) => ({
                            value: type,
                            label: t(FUEL_TYPE_LABELS[type]),
                          }))}
                        />
                      </div>
                      {renderField({
                        name: 'fuel_charge',
                        label:
                          fuelType === 'percent' ? 'Fuel charge %' : 'Fuel charge ($)',
                        step: '0.01',
                      })}
                      {rateType === 'hourly'
                        ? renderField({ name: 'hours', label: 'Hours', step: '0.25' })
                        : null}
                      <div className="ld-field" data-span={2} data-new-row>
                        <span>{t('Line total')}</span>
                        <output className="ld-output" aria-describedby={`${fieldId}-line-math`}>
                          {money(lineTotal(ticket)) || t('Draft')}
                        </output>
                        <small id={`${fieldId}-line-math`} className="ld-field-hint">
                          {t(lineBreakdown(ticket))}
                        </small>
                      </div>
                      <div className="ld-field" data-span={2} data-new-row>
                        <label htmlFor={`${fieldId}-client`}>
                          {t('Bill to client')}
                          <span className="ld-required" aria-hidden="true">
                            {' '}
                            *
                          </span>
                        </label>
                        <SelectField
                          // A new client changes the list: start the menu afresh.
                          key={`client-${activeIndex}-${clients.length}`}
                          id={`${fieldId}-client`}
                          aria-describedby={`${fieldId}-client-hint`}
                          value={clientChoice}
                          onValueChange={chooseClient}
                          options={clientOptions}
                        />
                        <small id={`${fieldId}-client-hint`} className="ld-field-hint">
                          {clientDetails}{' '}
                          <Link href="/customers">{t('Manage clients')}</Link>
                        </small>
                      </div>
                      {newClient ? (
                        <fieldset
                          className="ld-new-client"
                          aria-labelledby={`${fieldId}-new-client-title`}
                        >
                          <p id={`${fieldId}-new-client-title`} className="ld-new-client-title">
                            {t('New client')}
                          </p>
                          <div className="ld-fields">
                            {/* The examples describe each box; they never name a real client. */}
                            {newClientField('name', t('Company name'), {
                              required: true,
                              placeholder: t('Company name'),
                            })}
                            {newClientField('phone', t('Phone'), {
                              type: 'tel',
                              placeholder: PHONE_MASK,
                            })}
                            {newClientField('street', t('Address line 1'), {
                              placeholder: t('Street address'),
                            })}
                            {newClientField('city', t('Address line 2'), {
                              placeholder: t('City, state and ZIP'),
                            })}
                          </div>
                          {newClient.error ? (
                            <p className="ld-status" data-tone="error" role="alert">
                              {t(newClient.error)}
                            </p>
                          ) : null}
                          <div className="ld-actions ld-actions-flush">
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={newClient.saving}
                              onClick={() => setNewClient(null)}
                            >
                              {t('Cancel')}
                            </Button>
                            <Button
                              type="button"
                              disabled={newClient.saving}
                              onClick={() => void saveNewClient()}
                            >
                              {newClient.saving ? t('Saving…') : t('Save client')}
                            </Button>
                          </div>
                        </fieldset>
                      ) : null}
                    </div>
                  </div>
                </fieldset>

                <div className="ld-save">
                  <div>
                    <strong>
                      {activeSaved
                        ? batchChanged.length
                          ? t('Unsaved changes')
                          : activeUnchecked
                            ? t('Not checked yet')
                            : t('Ticket saved')
                        : t('Ready to save?')}
                    </strong>
                    <p>
                      {activeSaved
                        ? batchChanged.length
                          ? batchChanged.length > 1
                            ? t(
                                'Saving updates the saved tickets on this invoice ({tickets}) for everyone in your workspace.',
                                { tickets: plural(batchChanged.length, 'saved ticket') },
                              )
                            : t('Saving updates this saved ticket for everyone in your workspace.')
                          : activeUnchecked
                            ? t(
                                'It was read off the picture and kept in this date’s batch. Correct anything that is wrong, then save it to mark it checked.',
                              )
                            : t(
                                'Change any field to edit this ticket or its invoice, then save the changes.',
                              )
                        : t(
                            'The original file is stored with this record. Without a rate the invoice stays a draft.',
                          )}
                    </p>
                  </div>
                  <div className="ld-actions ld-actions-flush">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setInvoiceView({
                          lines: batchItems,
                          invoice: active.invoice,
                        })
                      }
                    >
                      <ReceiptText />
                      {t('Preview invoice')}
                    </Button>
                    <Button
                      type="submit"
                      data-phone-hidden={isPhone || undefined}
                      disabled={
                        busy ||
                        (activeSaved && !batchChanged.length && !activeUnchecked)
                      }
                    >
                      {activeSaved && !batchChanged.length && !activeUnchecked ? (
                        <Check />
                      ) : null}
                      {busy && activeSaved ? t('Saving…') : saveLabel}
                      {activeSaved ? null : (
                        <ChevronRight data-icon="inline-end" />
                      )}
                    </Button>
                  </div>
                </div>
                {/* The picture, at the foot of every step under the way to
                    the invoice: a stamp of it here, and the whole of it over
                    the screen when it is tapped. Laid out among the fields it
                    put a screen between one and the next; a desk has it
                    standing beside the form already (.ld-aside). */}
                {isPhone ? (
                  <button
                    type="button"
                    className="ld-thumb"
                    onClick={() => setViewingTicket(true)}
                  >
                    <span className="ld-thumb-shot">
                      <SourcePreview item={active} />
                    </span>
                    <span className="ld-thumb-copy">
                      <strong>{t('Original ticket')}</strong>
                      <small>
                        {active.source.file_name} · {fileSize(active.source.size)}
                      </small>
                    </span>
                    <FileSearch aria-hidden="true" />
                  </button>
                ) : null}
                <p
                  className="ld-status"
                  data-tone={saveStatus?.tone}
                  aria-live="polite"
                >
                  {saveStatus?.message}
                </p>
                {/* On a phone: back and on through the four steps. On a desk
                    every step is on the screen at once, so stepping did
                    nothing anyone could see; the buttons move between the
                    tickets of the invoice instead, as the arrows in the head
                    do, and are left out when the invoice is one ticket. */}
                {isPhone ? (
                  <div className="ld-step-nav">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={atStep === 0}
                      onClick={() => setStep((current) => Math.max(0, current - 1))}
                    >
                      <ChevronLeft data-icon="inline-start" />
                      {t('Back')}
                    </Button>
                    {/* Two buttons, keyed apart, and not one button that changes
                        what it is. They sit in the same place, so without the
                        keys React keeps the one element and swaps its type from
                        button to submit — which it does in the middle of the tap
                        that moved you on. The browser reads the type after the
                        tap has been handled, finds a submit button, and does
                        what a submit button does: the last step saved the ticket
                        the moment you arrived on it, and the fields went dead
                        (the fieldset is disabled while a save is in flight)
                        before you could read the step, let alone edit it. Keyed
                        apart, the Next button leaves the page instead, taking
                        its form owner with it, and nothing is submitted. */}
                    {atStep < lastStep ? (
                      <Button
                        key="next"
                        type="button"
                        onClick={() => setStep((current) => Math.min(lastStep, current + 1))}
                      >
                        {t('Next')}
                        <ChevronRight data-icon="inline-end" />
                      </Button>
                    ) : (
                      <Button
                        key="save"
                        type="submit"
                        disabled={
                          busy ||
                          (activeSaved && !batchChanged.length && !activeUnchecked)
                        }
                      >
                        {activeSaved && !batchChanged.length && !activeUnchecked ? (
                          <Check />
                        ) : null}
                        {busy && activeSaved ? t('Saving…') : saveLabel}
                      </Button>
                    )}
                  </div>
                ) : canStep ? (
                  <div className="ld-step-nav">
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={t('Previous ticket')}
                      disabled={previousStop === null}
                      onClick={() => {
                        if (previousStop === null) return;
                        setActiveIndex(previousStop);
                        scrollToReview();
                      }}
                    >
                      <ChevronLeft data-icon="inline-start" />
                      {t('Back')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={t('Next ticket')}
                      disabled={nextStop === null}
                      onClick={() => {
                        if (nextStop === null) return;
                        setActiveIndex(nextStop);
                        scrollToReview();
                      }}
                    >
                      {t('Next')}
                      <ChevronRight data-icon="inline-end" />
                    </Button>
                  </div>
                ) : null}
              </form>

              {isPhone ? null : (
                <aside className="ld-aside" aria-label={t('Source ticket')}>
                  <div>
                    <h3>{t('Original')}</h3>
                    {/* The column is as wide as the column is, and a weight
                        printed small on a photographed ticket is not readable
                        at that size. Rather than send the reviewer to another
                        screen and back for every field, the pointer carries a
                        magnifying glass over the picture: the file is far
                        larger than the box it is shown in, so what the lens
                        enlarges is detail that was already there.
                        Only over a photograph. A PDF is the browser's own
                        viewer in an iframe — drawing it twice would load it
                        twice — and the rest are words in a box, which do not
                        need magnifying. */}
                    {zoomablePreview ? (
                      <Lens
                        className="ld-aside-lens"
                        zoomFactor={1.8}
                        lensSize={190}
                        ariaLabel={t('Magnify the original ticket')}
                      >
                        <SourcePreview item={active} />
                      </Lens>
                    ) : (
                      <SourcePreview item={active} />
                    )}
                    <p className="ld-aside-note">
                      {active.source.file_name} · {fileSize(active.source.size)} ·
                      SHA-256 <code>{active.source.sha256.slice(0, 12)}</code>
                    </p>
                  </div>
                </aside>
              )}
            </div>
          </section>
        ) : null}
      </div>


      {viewingTicket && active ? (
        <TicketViewer item={active} onClose={() => setViewingTicket(false)} />
      ) : null}
      {pictureOf && pictureOf.preview_status === 'ready' ? (
        <TicketViewer item={pictureOf} onClose={closePicture} />
      ) : null}

      <InvoiceDialog view={invoiceView} onClose={() => setInvoiceView(null)} />

    </>
  );
}
