// The Load Desk working session: files waiting to be extracted, the tickets
// queued for review, and how far an extraction has got.
//
// It lives outside React so that opening another page and coming back does not
// throw the work away. An extraction started on the page keeps running while
// another page is open, because it writes here rather than into component
// state. The session is held in memory only: a reload starts fresh.

import type { QueueItem } from './types.ts';
import type { UploadReceipt } from './upload-receipt.ts';

/** A message under the upload or save button. */
export type DeskStatus = { message: string; tone: 'info' | 'error' } | null;

/** Extraction in progress: file `index` (0-based) of `total`, whole batch `percent`. */
export type DeskExtraction = {
  index: number;
  total: number;
  file: string;
  percent: number;
  label: string;
  /**
   * Read with nothing shown, for "Review later": no bar, no takeover, nothing
   * to dismiss — the ticket is read and filed while the page stays where it
   * was. Kept here with the rest of the extraction so it survives leaving the
   * page and coming back.
   */
  quiet: boolean;
} | null;

export type DeskSession = {
  queue: QueueItem[];
  /** The ticket being reviewed, or -1 when the queue is empty. */
  activeIndex: number;
  pending: File[];
  busy: boolean;
  uploadStatus: DeskStatus;
  /** Where each page of the last upload went: its record and its invoice. */
  uploadReceipt: UploadReceipt | null;
  extraction: DeskExtraction;
  saveStatus: DeskStatus;
  /**
   * Whether the camera is up. Here rather than in the page's own state because
   * the page is mounted whether or not you are looking at it — the section
   * either side of the one on screen is kept alive so it can be swiped to — so
   * "open the scanner" has to be something said to the session, not something
   * a page can only hear as it is created. Home's Scan ticket says it, and the
   * camera is up before the page it belongs to is the one on screen.
   */
  scannerOpen: boolean;
  /** A saved ticket that Invoices & Tickets has asked to be opened for editing. */
  editRequest: number | null;
  /** The truck chosen for the next upload. */
  truckChoice: string;
  /** The upload whose invoice tickets are being added to, while they extract. */
  addingTo: string | null;
  /**
   * What the last pass over the filed tickets left for a person: questions
   * about a job, asked once per job, and tickets with something of their own
   * to settle. Worked out on Load Desk from the records and profiles it holds
   * and said here, so the top bar on every other page can say "1 group needs
   * input" without working anything out itself.
   */
  needsInput: { groups: number; tickets: number };
};

const EMPTY: DeskSession = {
  queue: [],
  activeIndex: -1,
  pending: [],
  busy: false,
  uploadStatus: null,
  uploadReceipt: null,
  extraction: null,
  saveStatus: null,
  scannerOpen: false,
  editRequest: null,
  truckChoice: '',
  addingTo: null,
  needsInput: { groups: 0, tickets: 0 },
};

let session: DeskSession = EMPTY;
const listeners = new Set<() => void>();

const announce = () => {
  for (const listener of listeners) listener();
};

export function subscribeDesk(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const deskSnapshot = () => session;
export const serverDeskSnapshot = () => EMPTY;

/**
 * Replaces one part of the session. `value` is the next value, or a function
 * of the current one, so callers read like React's own setters.
 */
export function setDeskField<K extends keyof DeskSession>(
  key: K,
  value: DeskSession[K] | ((current: DeskSession[K]) => DeskSession[K]),
): void {
  const next =
    typeof value === 'function'
      ? (value as (current: DeskSession[K]) => DeskSession[K])(session[key])
      : value;
  if (Object.is(next, session[key])) return;
  session = { ...session, [key]: next };
  announce();
}

/** Ends the session: the queue is gone and the page starts empty. */
export function clearDesk(): void {
  session = EMPTY;
  announce();
}
