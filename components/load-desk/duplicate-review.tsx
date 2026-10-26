'use client';

import { useEffect, useEffectEvent, useRef, useState, type Ref } from 'react';
import { ExternalLink, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lens } from '@/components/ui/lens';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/use-t';
import {
  awaitsDuplicateReview,
  correctionProblem,
  differentTicketEdit,
  reopenReview,
  resolveSame,
  reviewEdit,
  type DuplicateAction,
} from '@/lib/load-desk/duplicates';
import { invoicePlacement, isPendingInvoiceNumber } from '@/lib/load-desk/records';
import {
  loadStoredOriginal,
  openStoredOriginal,
  reorderInvoicesByDate,
  updateSavedRecords,
} from '@/lib/load-desk/storage';
import { ticketDay } from '@/lib/load-desk/ticket-date';
import type { SavedRecord, Ticket } from '@/lib/load-desk/types';

// Pages whose ticket number is already on file, each beside the record it
// matched. The number is read off a picture, and a different ticket read a
// digit wrong looks exactly like a second photograph of the same one; the only
// way to tell is to look. So both pictures are here, with the figures that
// tell two loads apart — weights, times — set out beside them, and nothing is
// billed until somebody has said which it is.

/** The figures that tell two loads apart, in the order they are compared. */
const COMPARED: { field: keyof Ticket; label: string }[] = [
  { field: 'ticket_number', label: 'Ticket number' },
  { field: 'ticket_date', label: 'Date' },
  { field: 'time_out', label: 'Time out' },
  { field: 'gross_lb', label: 'Gross lb' },
  { field: 'tare_lb', label: 'Tare lb' },
  { field: 'net_tons', label: 'Net tons' },
  { field: 'product_code', label: 'Product' },
  { field: 'vehicle_id', label: 'Truck' },
];

const ACTIONS: Record<DuplicateAction, string> = {
  detected: 'Held as a possible duplicate',
  same_ticket: 'Confirmed the same ticket',
  different_ticket: 'Confirmed a different ticket',
  reopened: 'Reopened',
};

const shown = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

/** A stored original as a picture on the page, or why there is none. */
function useOriginal(record: SavedRecord | undefined) {
  const [state, setState] = useState<{ id: number; url: string | null } | null>(null);
  const id = record?.id;
  // Read through an event so the effect is keyed by the record's id alone:
  // the id is the picture, and its other fields changing does not change
  // what was photographed.
  const load = useEffectEvent(() => (record ? loadStoredOriginal(record) : Promise.resolve(null)));
  useEffect(() => {
    if (id === undefined) return;
    let url: string | null = null;
    let live = true;
    void load().then((blob) => {
      if (!live) return;
      url = blob ? URL.createObjectURL(blob) : null;
      setState({ id, url });
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  if (!record) return { status: 'missing' as const, url: null };
  if (!state || state.id !== record.id) return { status: 'loading' as const, url: null };
  return state.url ? { status: 'ready' as const, url: state.url } : { status: 'missing' as const, url: null };
}

function Original({ record, label }: { record: SavedRecord | undefined; label: string }) {
  const { t } = useT();
  const picture = useOriginal(record);
  const image = record?.source.type.startsWith('image/');
  return (
    <div className="ld-dup-picture">
      {picture.status === 'ready' && image ? (
        <Lens className="ld-aside-lens" zoomFactor={2.2} lensSize={180} ariaLabel={t('Magnify {label}', { label })}>
          <div className="ld-preview">
            {/* A blob URL: there is nothing for an image optimiser to fetch. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={picture.url} alt={t('Original ticket, {label}', { label })} />
          </div>
        </Lens>
      ) : (
        <div className="ld-preview ld-preview-empty">
          {picture.status === 'loading'
            ? t('Loading the stored original…')
            : picture.status === 'ready'
              ? t('This original is not a picture. Open it full size.')
              : t('The original is not stored for this ticket.')}
        </div>
      )}
      {record ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          onClick={() =>
            void openStoredOriginal(record).catch((error: unknown) =>
              toast.add({
                title: t('Could not open the original'),
                description: error instanceof Error ? t(error.message) : '',
                type: 'error',
              }),
            )
          }
        >
          <ExternalLink data-icon="inline-start" />
          {t('Open full size')}
        </Button>
      ) : null}
    </div>
  );
}

function AuditTrail({ record }: { record: SavedRecord }) {
  const { t } = useT();
  const history = record.duplicate_review?.history ?? [];
  return (
    <details className="ld-dup-history">
      <summary>
        <History />
        {t('History')} ({history.length})
      </summary>
      <ol>
        {history.map((step, index) => (
          <li key={index}>
            <span>
              {new Date(step.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              {' · '}
              <strong>{t(ACTIONS[step.action])}</strong>
              {step.by ? ` · ${step.by}` : ''}
            </span>
            <small>{step.note}</small>
          </li>
        ))}
      </ol>
    </details>
  );
}

function DuplicateCase({
  record,
  matched,
  records,
}: {
  record: SavedRecord;
  matched: SavedRecord | undefined;
  records: SavedRecord[];
}) {
  const { t, date } = useT();
  const review = record.duplicate_review!;
  // Held because the rest of the paper is that ticket's, not because the
  // number is: the number as read may well be right, and stands unless it
  // is corrected.
  const resembles = review.match === 'resemblance';
  const [mode, setMode] = useState<'ask' | 'different'>('ask');
  const [number, setNumber] = useState(review.read_number);
  // Asked only when no date was read off the page.
  const [enteredDate, setEnteredDate] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const numberBox = useRef<HTMLInputElement>(null);
  // Straight to the number once "Different ticket" is chosen: correcting it
  // is the one thing left to do.
  useEffect(() => {
    if (mode === 'different') numberBox.current?.select();
  }, [mode]);
  const theirInvoice = matched?.invoice.invoice_number.trim() ?? '';

  // Where it would be filed, said before it is: the invoice its date's
  // tickets are on, or a new one.
  const readDay = ticketDay(record.ticket.ticket_date);
  const day = readDay ?? ticketDay(enteredDate);
  const target = day
    ? invoicePlacement(
        { ...record, ticket: { ...record.ticket, ticket_number: number, ticket_date: day } },
        day,
        records,
      )
    : null;
  const targetNumber = target?.invoice.invoice_number.trim() ?? '';
  const joins = target?.batchId ? records.some((other) => other.invoice_batch_id === target.batchId) : false;

  async function save(edit: Parameters<typeof updateSavedRecords>[0][number]) {
    setBusy(true);
    const result = await updateSavedRecords([edit]);
    setBusy(false);
    if ('error' in result) {
      setProblem(t(result.error));
      return null;
    }
    return result.records[0];
  }

  async function same() {
    const saved = await save(reviewEdit(record, resolveSame(review, new Date().toISOString())));
    if (!saved) return;
    toast.add({
      title: t('Kept as the same ticket as record {id}', { id: review.suspected_of }),
      description: t('Record {id} stays held, never billed. Its photograph and history are kept.', { id: record.id }),
      type: 'success',
    });
  }

  async function different() {
    const wrong = correctionProblem(record, matched, number, records);
    if (wrong) {
      setProblem(t(wrong));
      return;
    }
    const saved = await save(
      differentTicketEdit(record, number, records, new Date().toISOString(), readDay ? null : enteredDate || null),
    );
    if (!saved) return;
    // A date with no invoice yet opened one on a draft mark; the ledger gives
    // it its number in date order.
    const renumbered = await reorderInvoicesByDate();
    const filed = renumbered.find((other) => other.id === saved.id) ?? saved;
    const onto = filed.invoice.invoice_number.trim();
    toast.add({
      title: t('Filed ticket {number}', { number: number.trim() }),
      description:
        onto && !isPendingInvoiceNumber(onto)
          ? t('Record {id} is on invoice {invoice} now.', { id: record.id, invoice: onto })
          : t('Record {id} is on its date’s invoice now.', { id: record.id }),
      type: 'success',
    });
  }

  return (
    <li className="ld-dup-case">
      <div className="ld-dup-head">
        <strong>
          {t('Ticket {number}', { number: review.read_number || t('unnumbered') })}
        </strong>
        <span>
          {resembles
            ? t('Record {id} resembles record {other}', { id: record.id, other: review.suspected_of })
            : t('Record {id} matches record {other}', { id: record.id, other: review.suspected_of })}
        </span>
      </div>
      {resembles && review.reasons?.length ? (
        <ul className="ld-dup-reasons">
          {review.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="ld-dup-pair">
        <figure>
          <figcaption>
            <strong>{t('This upload')}</strong>
            <span>
              {t('Record {id}', { id: record.id })} · {record.source.file_name} · {t('on no invoice')}
            </span>
          </figcaption>
          <Original record={record} label={t('this upload')} />
        </figure>
        <figure>
          <figcaption>
            <strong>{t('Already on file')}</strong>
            <span>
              {matched
                ? [
                    t('Record {id}', { id: matched.id }),
                    matched.source.file_name,
                    theirInvoice && !isPendingInvoiceNumber(theirInvoice)
                      ? t('Invoice {number}', { number: theirInvoice })
                      : t('on no invoice'),
                  ].join(' · ')
                : t('Record {id} is no longer on file.', { id: review.suspected_of })}
            </span>
          </figcaption>
          <Original record={matched} label={t('record on file')} />
        </figure>
      </div>
      <table className="ld-dup-fields">
        <thead>
          <tr>
            <th scope="col">{t('Field')}</th>
            <th scope="col">{t('This upload')}</th>
            <th scope="col">{t('On file')}</th>
          </tr>
        </thead>
        <tbody>
          {COMPARED.map(({ field, label }) => {
            const mine = field === 'ticket_date' ? date(record.ticket[field]) : record.ticket[field];
            const theirs = matched
              ? field === 'ticket_date'
                ? date(matched.ticket[field])
                : matched.ticket[field]
              : null;
            const differs = matched !== undefined && shown(mine) !== shown(theirs);
            return (
              <tr key={field} data-differs={differs || undefined}>
                <th scope="row">{t(label)}</th>
                <td>{shown(mine)}</td>
                <td>{shown(theirs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="ld-dup-hint">
        {t('Rows that differ are marked. The same ticket photographed twice has the same weights and times; a different load almost never does.')}
      </p>
      {mode === 'ask' ? (
        <div className="ld-dup-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void same()}>
            {t('Same ticket')}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setProblem(null);
              setMode('different');
            }}
          >
            {t('Different ticket')}
          </Button>
        </div>
      ) : (
        <form
          className="ld-dup-correct"
          onSubmit={(event) => {
            event.preventDefault();
            void different();
          }}
        >
          <label htmlFor={`ld-dup-number-${record.id}`}>
            {t('Ticket number printed on this page')}
          </label>
          <Input
            id={`ld-dup-number-${record.id}`}
            inputMode="numeric"
            autoComplete="off"
            ref={numberBox}
            value={number}
            onChange={(event) => {
              setNumber(event.target.value);
              setProblem(null);
            }}
          />
          {readDay ? null : (
            <>
              <label htmlFor={`ld-dup-date-${record.id}`}>{t('Date printed on this page')}</label>
              <Input
                id={`ld-dup-date-${record.id}`}
                type="date"
                value={enteredDate}
                onChange={(event) => setEnteredDate(event.target.value)}
              />
            </>
          )}
          <small>
            {target
              ? targetNumber && !isPendingInvoiceNumber(targetNumber)
                ? joins
                  ? t('It will be filed on invoice {number}, with the other tickets of {day}.', {
                      number: targetNumber,
                      day: date(day),
                    })
                  : t('It will open invoice {number} for {day}.', { number: targetNumber, day: date(day) })
                : t('It will be filed on the invoice for {day}.', { day: date(day) })
              : t('No date was read from it, so it will wait in “Date not found” for one.')}
          </small>
          <div className="ld-dup-actions">
            <Button type="submit" disabled={busy}>
              {resembles && number.trim() === review.read_number ? t('File as a different ticket') : t('Correct and file')}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode('ask')}>
              {t('Cancel')}
            </Button>
          </div>
        </form>
      )}
      {problem ? (
        <p className="ld-dup-problem" role="alert">
          {problem}
        </p>
      ) : null}
      <AuditTrail record={record} />
    </li>
  );
}

/**
 * Every page held as a possible duplicate: those still to compare, and below
 * them the ones found to be the same ticket, kept with their history and
 * open to being looked at again.
 */
export default function DuplicateReviewPanel({
  ref,
  held,
  records,
}: {
  ref?: Ref<HTMLElement>;
  held: SavedRecord[];
  records: SavedRecord[];
}) {
  const { t, plural } = useT();
  const [reopening, setReopening] = useState<number | null>(null);
  const waiting = held.filter(awaitsDuplicateReview);
  const settled = held.filter((record) => record.duplicate_review?.resolution === 'same');
  if (!waiting.length && !settled.length) return null;
  const byId = new Map([...records, ...held].map((record) => [record.id, record]));

  async function reopen(record: SavedRecord) {
    setReopening(record.id);
    const result = await updateSavedRecords([
      reviewEdit(record, reopenReview(record.duplicate_review!, new Date().toISOString())),
    ]);
    setReopening(null);
    if ('error' in result) {
      toast.add({ title: t('Could not reopen it'), description: t(result.error), type: 'error' });
    }
  }

  return (
    <section className="ld-panel ld-duplicates" aria-labelledby="ld-duplicates-title" ref={ref}>
      <div className="ld-panel-head">
        <div>
          <p className="ld-step">{t('Compare')}</p>
          <h2 id="ld-duplicates-title">{t('Possible duplicates')}</h2>
        </div>
        {waiting.length ? (
          <span className="ld-dup-count">{plural(waiting.length, 'ticket')}</span>
        ) : null}
      </div>
      {waiting.length ? (
        <>
          <p className="ld-dup-intro">
            {t('These pages have a ticket number already on file, or one a single misread away from a ticket they otherwise match. Each is kept with its photograph and left off every invoice until you say whether it is the same ticket.')}
          </p>
          <ul className="ld-dup-list">
            {waiting.map((record) => (
              <DuplicateCase
                key={record.id}
                record={record}
                matched={byId.get(record.duplicate_review!.suspected_of)}
                records={records}
              />
            ))}
          </ul>
        </>
      ) : null}
      {settled.length ? (
        <details className="ld-dup-settled">
          <summary>
            {t('Checked: the same ticket ({count})', { count: settled.length })}
          </summary>
          <ul>
            {settled.map((record) => (
              <li key={record.id}>
                <div className="ld-dup-head">
                  <span>
                    {t('Record {id} is record {other} again. Kept, never billed.', {
                      id: record.id,
                      other: record.duplicate_review!.suspected_of,
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    disabled={reopening === record.id}
                    onClick={() => void reopen(record)}
                  >
                    {t('Reopen')}
                  </Button>
                </div>
                <AuditTrail record={record} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
