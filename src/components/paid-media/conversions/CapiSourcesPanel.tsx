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
import { useLocale, useTranslations } from 'next-intl';
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
  capiIssueMessage,
  leafPaths,
  nowSeconds,
  sampleWebhookBody,
  signedCurl,
  unsignedCurl,
  writeFailure,
} from './capiHelpers';

export const capiIngestUrl = (publicId: string) => getApiUrl(`${CAPI_ROUTES.hooks}/${publicId}`);

export function CapiSourcesPanel(props: CapiPanelProps) {
  const uiText = useTranslations('scale');
  const { brandId } = props;
  const sources = useQuery({
    queryKey: capiQueryKeys.sources(brandId),
    queryFn: () => fetchCapiSources(brandId),
    retry: false,
  });
  return (
    <Panel
      title={uiText('webhook_sources_7ae1e38')}
      description={uiText('named_inbound_urls_your_crm_form_tool_or_book_cceb1a0')}
    >
      <CreateSourceForm {...props} />
      {sources.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : sources.isError ? (
        <PanelError
          message={capiErrorMessage(sources.error, 'Could not load webhook sources.', uiText)}
        />
      ) : sources.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">{uiText('no_webhook_sources_yet_db0dd4a')}</p>
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
  const uiText = useTranslations('scale');
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
      setError(writeFailure(createError, onForbidden, 'Could not create this source.', uiText));
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
          <Label htmlFor={nameId}>{uiText('source_name_1939968')}</Label>
          <Input
            id={nameId}
            className="w-48"
            value={name}
            placeholder={uiText('hubspot_closed_won_7ebc594')}
            disabled={readOnly || busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={eventId}>{uiText('default_event_name_77341f5')}</Label>
          <EventNameInput
            id={eventId}
            value={eventName}
            onChange={setEventName}
            disabled={readOnly || busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{uiText('action_source_771ead1')}</Label>
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
          {uiText('require_signature_739dbe5')}
        </SwitchField>
        <Button
          disabled={readOnly || busy || !name.trim() || !eventName.trim()}
          onClick={() => void create()}
        >
          {uiText('create_source_020457f')}
        </Button>
      </div>
      <PanelError message={error} />
    </div>
  );
}

function CreatedSource({ created, onDismiss }: { created: Created; onDismiss: () => void }) {
  const uiText = useTranslations('scale');
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
      subject={uiText('capiRevealSubject', { kind: 'source', name: source.name })}
      onDismiss={onDismiss}
    >
      <div className="space-y-1">
        <p className="text-xs font-medium">{uiText('ingest_url_55c4ce6')}</p>
        <CopyBlock value={url} label="URL" />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">
          {uiText('unsigned_the_url_is_the_credential_165b71c')}
        </p>
        {source.requireSignature ? (
          <p className="text-xs">
            {uiText('this_source_requires_a_signature_so_it_refuse_0ccfb3f')}
          </p>
        ) : null}
        <CopyBlock value={unsignedCurl(url, body)} label={uiText('unsigned_curl_07e8327')} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">
          {uiText('signed_standard_webhooks_webhook_id_webhook_t_8848ed9')}
        </p>
        <p className="text-xs">
          {uiText.rich('sentence_ac20fe23fcaf', {
            v0: () => (
              <button type="button" className="underline" onClick={sign}>
                {uiText('sign_again_34f18a4')}
              </button>
            ),
            v1: () => <span className="font-mono">id.timestamp.body</span>,
            v2: () => <span className="font-mono">whsec_</span>,
          })}
        </p>
        {signed ? <CopyBlock value={signed.curl} label={uiText('signed_curl_6fe6055')} /> : null}
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
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
      setError(writeFailure(writeError, onForbidden, fallback, uiText));
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
            {mappedCount
              ? uiText('template_8877f77d012e', { count: mappedCount })
              : uiText('native_format_7fab526')}{' '}
            ·{' '}
            {source.lastReceivedAt
              ? uiText('template_7a80ddde286a', {
                  v0: new Date(source.lastReceivedAt).toLocaleString(uiLocale),
                })
              : uiText('nothing_received_yet_da85c28')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {source.requireSignature ? (
            <Badge variant="outline">{uiText('signed_only_a0b37d7')}</Badge>
          ) : null}
          <Switch
            aria-label={uiText('template_591872fa0a4c', { v0: source.name })}
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
            {mapping ? uiText('close_mapping_b59d773') : uiText('map_fields_78611a0')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={readOnly || busy}
                  aria-label={uiText('template_3468c78743f0', { v0: source.name })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {uiText.rich('sentence_8c6c8ffd09eb', { v0: source.name })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {uiText('its_url_stops_accepting_events_immediately_pa_09a90b8')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{uiText('keep_it_fdce5da')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    void write(
                      () => deleteCapiSource(brandId, source.id),
                      'Could not delete this source.',
                    )
                  }
                >
                  {uiText('delete_source_26f4130')}
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
          onLoadLastSample={async () => {
            await queryClient.refetchQueries({ queryKey: capiQueryKeys.sources(brandId) });
            const fresh = queryClient
              .getQueryData<CapiSource[]>(capiQueryKeys.sources(brandId))
              ?.find((row) => row.id === source.id);
            return fresh?.lastSample ?? null;
          }}
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

const sampleJson = (value: unknown): string => JSON.stringify(value, null, 2);

export function FieldMapEditor({
  source,
  readOnly,
  onSave,
  onLoadLastSample,
}: {
  source: CapiSource;
  readOnly: boolean;
  onSave: (fieldMap: CapiFieldMap) => Promise<void>;
  /** Re-reads the source; resolves to what its URL last received (redacted), or null. */
  onLoadLastSample: () => Promise<unknown>;
}) {
  const uiText = useTranslations('scale');
  const sampleId = useId();
  const [sampleText, setSampleText] = useState(() =>
    source.lastSample ? sampleJson(source.lastSample) : '',
  );
  const [nothingReceived, setNothingReceived] = useState(false);
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

  const loadLastSample = async () => {
    const lastSample = await onLoadLastSample();
    setNothingReceived(lastSample === null);
    if (lastSample !== null) setSampleText(sampleJson(lastSample));
  };

  const setField = (field: CapiMappableField, path: string) =>
    setFieldMap((current) => {
      const { [field]: _removed, ...rest } = current;
      return path === NOT_MAPPED ? rest : { ...rest, [field]: path };
    });

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        {uiText.rich('sentence_c4c4b0f97934', {
          v0: () => <span className="font-mono">{'{ events: [...] }'}</span>,
          v1: () => <span className="font-mono">?test=1</span>,
        })}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={sampleId}>{uiText('sample_payload_json_2560682')}</Label>
          <Button size="sm" variant="outline" type="button" onClick={() => void loadLastSample()}>
            {uiText('load_last_received_payload_3a2b043')}
          </Button>
        </div>
        {nothingReceived ? (
          <p className="text-xs text-muted-foreground">
            {uiText('nothing_has_arrived_yet_send_a_test_from_hubs_2bd80cb')}
          </p>
        ) : null}
        <Textarea
          id={sampleId}
          rows={6}
          className="font-mono text-xs"
          value={sampleText}
          placeholder='{"contact": {"email": "ada@example.com"}, "deal": {"amount": 1200}}'
          onChange={(event) => setSampleText(event.target.value)}
        />
        {sample && !sample.ok ? (
          <PanelError message={uiText('that_is_not_valid_json_f520c48')} />
        ) : null}
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
              <SelectTrigger
                size="sm"
                className="w-56"
                aria-label={uiText('template_c1406aded858', { v0: field })}
              >
                <SelectValue items={pathLabels} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_MAPPED}>{uiText('not_mapped_9ea5619')}</SelectItem>
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
          <p className="text-xs font-medium">
            {uiText('preview_what_this_payload_becomes_831a520')}
          </p>
          {preview.ok ? (
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(preview.event, null, 2)}
            </pre>
          ) : (
            (
              preview.issueDetails?.map((issue) => capiIssueMessage(issue, uiText)) ?? [
                capiIssueMessage({}, uiText),
              ]
            ).map((issue) => <PanelError key={issue} message={issue} />)
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
        {saving ? uiText('saving_23e3929') : uiText('save_mapping_bb40e39')}
      </Button>
    </div>
  );
}
