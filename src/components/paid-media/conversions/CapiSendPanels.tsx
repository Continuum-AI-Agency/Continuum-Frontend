'use client';

import {
  applyCapiFieldMap,
  CAPI_STANDARD_EVENT_NAMES,
  type CapiActionSource,
  type CapiEventInput,
  type CapiSendResult,
  capiActionSourceSchema,
  capiCsvFieldMap,
  capiMappableFieldSchema,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { capiQueryKeys, sendCapiEvents } from '@/lib/api/conversionsApi';
import { useCapiSettings } from './CapiPixelPanel';
import { Panel, PanelError, SwitchField } from './CapiShared';
import {
  type CapiPanelProps,
  type CsvReview,
  chunk,
  invalidEventIssues,
  nowSeconds,
  reviewCsv,
  writeFailure,
} from './capiHelpers';

export const ACTION_SOURCE_LABELS = Object.fromEntries(
  capiActionSourceSchema.options.map((value) => [value, value.replace(/_/g, ' ')]),
) as Record<CapiActionSource, string>;

export function ActionSourceSelect({
  value,
  onChange,
  disabled,
}: {
  value: CapiActionSource;
  onChange: (value: CapiActionSource) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-48" aria-label="Action source">
        <SelectValue items={ACTION_SOURCE_LABELS} />
      </SelectTrigger>
      <SelectContent>
        {capiActionSourceSchema.options.map((option) => (
          <SelectItem key={option} value={option}>
            {ACTION_SOURCE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A text input that suggests Meta's standard event names and still takes a custom one. */
export function EventNameInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  return (
    <>
      <Input
        id={id}
        className="w-48"
        list={listId}
        value={value}
        disabled={disabled}
        aria-label={id ? undefined : 'Event name'}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {CAPI_STANDARD_EVENT_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

function TestNotice({ brandId, test }: { brandId: string; test: boolean }) {
  const settings = useCapiSettings(brandId);
  if (!settings.data) {
    return <p className="text-xs text-muted-foreground">Save a pixel above before sending.</p>;
  }
  if (test && !settings.data.testEventCode) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        No test event code is saved, so these events count as real conversions.
      </p>
    );
  }
  return null;
}

function SendOutcome({ result }: { result: CapiSendResult }) {
  return (
    <div className="space-y-0.5 rounded-md bg-muted/40 p-2 text-xs">
      <p>
        Meta received {result.eventsReceived} event{result.eventsReceived === 1 ? '' : 's'}
        {result.testEventCode ? ` under test code ${result.testEventCode}` : ''}.
      </p>
      {result.fbtraceId ? <p className="font-mono">fbtrace_id {result.fbtraceId}</p> : null}
      {result.messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}

export function CapiSendEventPanel({ brandId, readOnly, onForbidden }: CapiPanelProps) {
  const queryClient = useQueryClient();
  const ids = { event: useId(), email: useId(), phone: useId(), value: useId(), currency: useId() };
  const [eventName, setEventName] = useState<string>('Lead');
  const [actionSource, setActionSource] = useState<CapiActionSource>('system_generated');
  const [form, setForm] = useState({ email: '', phone: '', value: '', currency: '' });
  const [test, setTest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CapiSendResult | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const field = (key: keyof typeof form) => ({
    value: form[key],
    disabled: readOnly || busy,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const send = async () => {
    setResult(null);
    // The form is a flat payload keyed by CAPI field, so the CSV mapping reads it as-is.
    const payload = { event_name: eventName, ...form };
    const mapped = applyCapiFieldMap(
      payload,
      { eventName, actionSource, fieldMap: capiCsvFieldMap(Object.keys(payload)) },
      nowSeconds(),
    );
    if (!mapped.ok) {
      setIssues(mapped.issues);
      return;
    }
    setBusy(true);
    setIssues([]);
    try {
      setResult(await sendCapiEvents({ brandId, source: 'manual', test, events: [mapped.event] }));
    } catch (error) {
      const eventIssues = invalidEventIssues(error);
      const failure = eventIssues
        ? null
        : writeFailure(error, onForbidden, 'Could not send this event.');
      setIssues(eventIssues?.map((issue) => issue.message) ?? (failure ? [failure] : []));
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: capiQueryKeys.deliveries(brandId) });
    }
  };

  return (
    <Panel
      title="Send one event"
      description="Check the connection end to end with a single event."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={ids.event}>Event name</Label>
          <EventNameInput
            id={ids.event}
            value={eventName}
            onChange={setEventName}
            disabled={readOnly || busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Action source</Label>
          <ActionSourceSelect
            value={actionSource}
            onChange={setActionSource}
            disabled={readOnly || busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.email}>Email</Label>
          <Input id={ids.email} type="email" {...field('email')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.phone}>Phone</Label>
          <Input id={ids.phone} type="tel" {...field('phone')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.value}>Value</Label>
          <Input id={ids.value} inputMode="decimal" {...field('value')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.currency}>Currency</Label>
          <Input id={ids.currency} placeholder="USD" maxLength={3} {...field('currency')} />
        </div>
      </div>
      <SwitchField checked={test} onCheckedChange={setTest} disabled={readOnly || busy}>
        Send as a test event
      </SwitchField>
      <TestNotice brandId={brandId} test={test} />
      <Button disabled={readOnly || busy} onClick={() => void send()}>
        {busy ? 'Sending…' : 'Send event'}
      </Button>
      {issues.map((issue) => (
        <PanelError key={issue} message={issue} />
      ))}
      {result ? <SendOutcome result={result} /> : null}
    </Panel>
  );
}

const MAX_ISSUES_SHOWN = 50;

export function CapiCsvUploadPanel({ brandId, readOnly, onForbidden }: CapiPanelProps) {
  const queryClient = useQueryClient();
  const fileId = useId();
  const eventId = useId();
  const [eventName, setEventName] = useState<string>('Purchase');
  const [actionSource, setActionSource] = useState<CapiActionSource>('system_generated');
  const [text, setText] = useState<string | null>(null);
  const [test, setTest] = useState(true);
  const [progress, setProgress] = useState<{ sent: number; received: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-reviewed whenever the defaults change, so the counts never describe stale settings.
  const review: CsvReview | null = useMemo(
    () => (text === null ? null : reviewCsv(text, { eventName, actionSource }, nowSeconds())),
    [text, eventName, actionSource],
  );

  const send = async (events: CapiEventInput[]) => {
    setBusy(true);
    setError(null);
    setProgress({ sent: 0, received: 0 });
    let offset = 0;
    try {
      for (const batch of chunk(events)) {
        const result = await sendCapiEvents({ brandId, source: 'csv', test, events: batch });
        offset += batch.length;
        setProgress((current) => ({
          sent: offset,
          received: (current?.received ?? 0) + result.eventsReceived,
        }));
      }
    } catch (sendError) {
      const eventIssues = invalidEventIssues(sendError);
      setError(
        eventIssues
          ? `Stopped after ${offset} events: ${eventIssues
              .map((issue) => `event ${offset + issue.index + 1}: ${issue.message}`)
              .join('; ')}`
          : writeFailure(sendError, onForbidden, `Stopped after ${offset} events.`),
      );
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: capiQueryKeys.deliveries(brandId) });
    }
  };

  return (
    <Panel
      title="Upload offline conversions"
      description={
        <>
          A CSV with a header row. Recognized columns:{' '}
          <span className="font-mono">{capiMappableFieldSchema.options.join(', ')}</span>. Other
          columns are ignored. Rows without event_name use the default below; rows without
          event_time use now.
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={eventId}>Default event name</Label>
          <EventNameInput
            id={eventId}
            value={eventName}
            onChange={setEventName}
            disabled={readOnly || busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Action source</Label>
          <ActionSourceSelect
            value={actionSource}
            onChange={setActionSource}
            disabled={readOnly || busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fileId}>CSV file</Label>
          <Input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            className="w-64"
            disabled={readOnly || busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setProgress(null);
              setError(null);
              setText(file ? await file.text() : null);
            }}
          />
        </div>
      </div>

      {review ? (
        <div className="space-y-2 text-xs">
          <p>
            {review.events.length} valid row{review.events.length === 1 ? '' : 's'} ·{' '}
            {review.issues.length} skipped
          </p>
          {review.issues.length > 0 ? (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-destructive">
              {review.issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => (
                <li key={issue.line}>
                  Line {issue.line}: {issue.message}
                </li>
              ))}
              {review.issues.length > MAX_ISSUES_SHOWN ? (
                <li>…and {review.issues.length - MAX_ISSUES_SHOWN} more</li>
              ) : null}
            </ul>
          ) : null}
          <SwitchField checked={test} onCheckedChange={setTest} disabled={readOnly || busy}>
            Send as test events
          </SwitchField>
          <TestNotice brandId={brandId} test={test} />
          <Button
            disabled={readOnly || busy || review.events.length === 0}
            onClick={() => void send(review.events)}
          >
            {busy ? 'Sending…' : `Send ${review.events.length} events`}
          </Button>
        </div>
      ) : null}
      {progress ? (
        <p className="text-xs">
          Sent {progress.sent} · Meta received {progress.received}
        </p>
      ) : null}
      <PanelError message={error} />
    </Panel>
  );
}
