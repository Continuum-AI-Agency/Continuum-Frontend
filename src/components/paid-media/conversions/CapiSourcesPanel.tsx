'use client';

import {
  applyCapiFieldMap,
  CAPI_ROUTES,
  type CapiActionSource,
  type CapiFieldMap,
  type CapiMappableField,
  type CapiSource,
  capiMappableFieldSchema,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getApiUrl } from '@/lib/api/config';
import {
  capiQueryKeys,
  createCapiSource,
  deleteCapiSource,
  fetchCapiSources,
  updateCapiSource,
} from '@/lib/api/conversionsApi';
import { ACTION_SOURCE_LABELS, ActionSourceSelect, EventNameInput } from './CapiSendPanels';
import {
  CopyBlock,
  CopyButton,
  Panel,
  PanelError,
  RevealOnceSecret,
  SwitchField,
} from './CapiShared';
import {
  type CapiPanelProps,
  capiErrorMessage,
  leafPaths,
  nowSeconds,
  sampleWebhookBody,
  signedCurl,
  unsignedCurl,
  writeFailure,
} from './capiHelpers';

export const capiIngestUrl = (publicId: string) => getApiUrl(`${CAPI_ROUTES.hooks}/${publicId}`);

export function CapiSourcesPanel(props: CapiPanelProps) {
  const { brandId } = props;
  const sources = useQuery({
    queryKey: capiQueryKeys.sources(brandId),
    queryFn: () => fetchCapiSources(brandId),
    retry: false,
  });
  return (
    <Panel
      title="Webhook sources"
      description="Named inbound URLs your CRM, form tool or booking app posts conversions to."
    >
      <CreateSourceForm {...props} />
      {sources.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : sources.isError ? (
        <PanelError message={capiErrorMessage(sources.error, 'Could not load webhook sources.')} />
      ) : sources.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No webhook sources yet.</p>
      ) : (
        <div className="space-y-2">
          {sources.data.map((source) => (
            <SourceRow key={source.id} source={source} {...props} />
          ))}
        </div>
      )}
    </Panel>
  );
}

type Created = { source: CapiSource; signingSecret: string };

function CreateSourceForm({ brandId, readOnly, onForbidden }: CapiPanelProps) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const eventId = useId();
  const [name, setName] = useState('');
  const [eventName, setEventName] = useState<string>('Lead');
  const [actionSource, setActionSource] = useState<CapiActionSource>('system_generated');
  const [requireSignature, setRequireSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setCreated(
        await createCapiSource({
          brandId,
          name: name.trim(),
          eventName: eventName.trim(),
          actionSource,
          requireSignature,
        }),
      );
      setName('');
      await queryClient.invalidateQueries({ queryKey: capiQueryKeys.sources(brandId) });
    } catch (createError) {
      setError(writeFailure(createError, onForbidden, 'Could not create this source.'));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return <CreatedSource created={created} onDismiss={() => setCreated(null)} />;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={nameId}>Source name</Label>
          <Input
            id={nameId}
            className="w-48"
            value={name}
            placeholder="HubSpot closed-won"
            disabled={readOnly || busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
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
        <SwitchField
          checked={requireSignature}
          onCheckedChange={setRequireSignature}
          disabled={readOnly || busy}
        >
          Require signature
        </SwitchField>
        <Button
          disabled={readOnly || busy || !name.trim() || !eventName.trim()}
          onClick={() => void create()}
        >
          Create source
        </Button>
      </div>
      <PanelError message={error} />
    </div>
  );
}

function CreatedSource({ created, onDismiss }: { created: Created; onDismiss: () => void }) {
  const { source, signingSecret } = created;
  const url = capiIngestUrl(source.publicId);
  const [signed, setSigned] = useState<{ at: number; curl: string } | null>(null);
  const body = sampleWebhookBody(source.eventName, source.actionSource, signed?.at ?? nowSeconds());

  const sign = () => {
    const at = nowSeconds();
    void signedCurl(
      url,
      sampleWebhookBody(source.eventName, source.actionSource, at),
      signingSecret,
      at,
    ).then((curl) => setSigned({ at, curl }));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: sign once per revealed secret
  useEffect(sign, [signingSecret]);

  return (
    <RevealOnceSecret
      secret={signingSecret}
      subject={`source “${source.name}”`}
      onDismiss={onDismiss}
    >
      <div className="space-y-1">
        <p className="text-xs font-medium">Ingest URL</p>
        <CopyBlock value={url} label="URL" />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Unsigned (the URL is the credential)</p>
        {source.requireSignature ? (
          <p className="text-xs">This source requires a signature, so it refuses this one.</p>
        ) : null}
        <CopyBlock value={unsignedCurl(url, body)} label="Unsigned curl" />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">
          Signed (Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature)
        </p>
        <p className="text-xs">
          The timestamp is now, so run it within a few minutes or{' '}
          <button type="button" className="underline" onClick={sign}>
            sign again
          </button>
          . Sign real requests the same way: base64 HMAC-SHA256 of{' '}
          <span className="font-mono">id.timestamp.body</span>, keyed by the decoded bytes after{' '}
          <span className="font-mono">whsec_</span>.
        </p>
        {signed ? <CopyBlock value={signed.curl} label="Signed curl" /> : null}
      </div>
    </RevealOnceSecret>
  );
}

function SourceRow({
  source,
  brandId,
  readOnly,
  onForbidden,
}: CapiPanelProps & { source: CapiSource }) {
  const queryClient = useQueryClient();
  const [mapping, setMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = capiIngestUrl(source.publicId);
  const mappedCount = Object.keys(source.fieldMap).length;

  const write = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: capiQueryKeys.sources(brandId) });
    } catch (writeError) {
      setError(writeFailure(writeError, onForbidden, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{source.name}</p>
          <p className="text-xs text-muted-foreground">
            {source.eventName} · {ACTION_SOURCE_LABELS[source.actionSource]} ·{' '}
            {mappedCount ? `${mappedCount} mapped fields` : 'native format'} ·{' '}
            {source.lastReceivedAt
              ? `last received ${new Date(source.lastReceivedAt).toLocaleString()}`
              : 'nothing received yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {source.requireSignature ? <Badge variant="outline">Signed only</Badge> : null}
          <Switch
            aria-label={`${source.name} enabled`}
            checked={source.enabled}
            disabled={readOnly || busy}
            onCheckedChange={(enabled) =>
              void write(
                () => updateCapiSource(source.id, { brandId, enabled }),
                'Could not update this source.',
              )
            }
          />
          <Button size="sm" variant="outline" onClick={() => setMapping((open) => !open)}>
            {mapping ? 'Close mapping' : 'Map fields'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={readOnly || busy}
                  aria-label={`Delete ${source.name}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{source.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Its URL stops accepting events immediately. Past deliveries stay in the list.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    void write(
                      () => deleteCapiSource(brandId, source.id),
                      'Could not delete this source.',
                    )
                  }
                >
                  Delete source
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url}</code>
        <CopyButton value={url} label="URL" />
      </div>
      <PanelError message={error} />
      {mapping ? (
        <FieldMapEditor
          source={source}
          readOnly={readOnly}
          onSave={(fieldMap) =>
            write(
              () => updateCapiSource(source.id, { brandId, fieldMap }),
              'Could not save the mapping.',
            )
          }
        />
      ) : null}
    </div>
  );
}

const NOT_MAPPED = '__not_mapped__';

function parseSample(text: string): { ok: true; value: unknown } | { ok: false } | null {
  if (!text.trim()) return null;
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function FieldMapEditor({
  source,
  readOnly,
  onSave,
}: {
  source: CapiSource;
  readOnly: boolean;
  onSave: (fieldMap: CapiFieldMap) => Promise<void>;
}) {
  const sampleId = useId();
  const [sampleText, setSampleText] = useState('');
  const [fieldMap, setFieldMap] = useState<CapiFieldMap>(source.fieldMap);
  const [saving, setSaving] = useState(false);
  const sample = parseSample(sampleText);
  const paths = [
    ...new Set([
      ...(sample?.ok ? leafPaths(sample.value) : []),
      ...Object.values(fieldMap).filter((path): path is string => Boolean(path)),
    ]),
  ];
  const pathLabels = {
    [NOT_MAPPED]: 'Not mapped',
    ...Object.fromEntries(paths.map((p) => [p, p])),
  };
  const preview = sample?.ok
    ? applyCapiFieldMap(
        sample.value,
        { eventName: source.eventName, actionSource: source.actionSource, fieldMap },
        nowSeconds(),
      )
    : null;

  const setField = (field: CapiMappableField, path: string) =>
    setFieldMap((current) => {
      const { [field]: _removed, ...rest } = current;
      return path === NOT_MAPPED ? rest : { ...rest, [field]: path };
    });

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        An empty map means the sender posts Continuum&rsquo;s native format (
        <span className="font-mono">{'{ events: [...] }'}</span>). Map fields when the sender has
        its own shape: paste one of its payloads, then pick where each field lives. Add{' '}
        <span className="font-mono">?test=1</span> to the URL to send a mapped payload as a test.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={sampleId}>Sample payload (JSON)</Label>
        <Textarea
          id={sampleId}
          rows={6}
          className="font-mono text-xs"
          value={sampleText}
          placeholder='{"contact": {"email": "ada@example.com"}, "deal": {"amount": 1200}}'
          onChange={(event) => setSampleText(event.target.value)}
        />
        {sample && !sample.ok ? <PanelError message="That is not valid JSON." /> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {capiMappableFieldSchema.options.map((field) => (
          <div key={field} className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{field}</span>
            <Select
              value={fieldMap[field] ?? NOT_MAPPED}
              onValueChange={(path) => setField(field, path)}
              disabled={readOnly}
            >
              <SelectTrigger size="sm" className="w-56" aria-label={`${field} path`}>
                <SelectValue items={pathLabels} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_MAPPED}>Not mapped</SelectItem>
                {paths.map((path) => (
                  <SelectItem key={path} value={path}>
                    {path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      {preview ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Preview: what this payload becomes</p>
          {preview.ok ? (
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(preview.event, null, 2)}
            </pre>
          ) : (
            preview.issues.map((issue) => <PanelError key={issue} message={issue} />)
          )}
        </div>
      ) : null}
      <Button
        size="sm"
        disabled={readOnly || saving}
        onClick={async () => {
          setSaving(true);
          await onSave(fieldMap);
          setSaving(false);
        }}
      >
        {saving ? 'Saving…' : 'Save mapping'}
      </Button>
    </div>
  );
}
