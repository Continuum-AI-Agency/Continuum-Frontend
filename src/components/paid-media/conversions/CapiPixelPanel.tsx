'use client';

import {
  type CapiPixel,
  type CapiSettings,
  createAutomationWebhookDestinationRequestSchema,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast-imperative';
import {
  capiQueryKeys,
  fetchCapiPixels,
  fetchCapiSettings,
  saveCapiSettings,
} from '@/lib/api/conversionsApi';
import {
  createAutomationWebhookDestination,
  fetchAutomationWebhookResources,
} from '@/lib/automations/automations';
import { Panel, PanelError, RevealOnceSecret } from './CapiShared';
import { type CapiPanelProps, capiErrorMessage, writeFailure } from './capiHelpers';

const NO_FORWARD = 'none';
const pixelKey = (pixel: Pick<CapiPixel, 'adAccountId' | 'id'>) =>
  `${pixel.adAccountId}|${pixel.id}`;
const destinationUrlSchema = createAutomationWebhookDestinationRequestSchema.shape.url;
const webhookResourcesKey = (brandId: string) => ['automation-webhook-resources', brandId] as const;

const lastFired = (value: string | null) =>
  value ? `last fired ${new Date(value).toLocaleDateString()}` : 'never fired';

export function useCapiSettings(brandId: string) {
  return useQuery({
    queryKey: capiQueryKeys.settings(brandId),
    queryFn: () => fetchCapiSettings(brandId),
    retry: false,
  });
}

export function CapiPixelPanel(props: CapiPanelProps) {
  const settings = useCapiSettings(props.brandId);
  return (
    <Panel
      title="Pixel"
      description="The Meta dataset (pixel) server events are sent to, and where each delivery result is forwarded."
    >
      {settings.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : settings.isError ? (
        <PanelError message={capiErrorMessage(settings.error, 'Could not load CAPI settings.')} />
      ) : (
        <PixelForm key={settings.data?.updatedAt ?? 'new'} settings={settings.data} {...props} />
      )}
    </Panel>
  );
}

function PixelForm({
  brandId,
  readOnly,
  onForbidden,
  settings,
}: CapiPanelProps & { settings: CapiSettings | null }) {
  const queryClient = useQueryClient();
  const testCodeId = useId();
  const [pixel, setPixel] = useState(
    settings ? pixelKey({ ...settings, id: settings.pixelId }) : '',
  );
  const [testCode, setTestCode] = useState(settings?.testEventCode ?? '');
  const [forward, setForward] = useState(settings?.forwardDestinationId ?? NO_FORWARD);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pixels = useQuery({
    queryKey: capiQueryKeys.pixels(brandId),
    queryFn: () => fetchCapiPixels(brandId),
    retry: false,
  });
  const byAccount = new Map<string, CapiPixel[]>();
  for (const item of pixels.data ?? []) {
    byAccount.set(item.adAccountId, [...(byAccount.get(item.adAccountId) ?? []), item]);
  }
  const pixelLabels = Object.fromEntries(
    (pixels.data ?? []).map((item) => [pixelKey(item), `${item.name ?? item.id} · ${item.id}`]),
  );
  if (settings && !pixelLabels[pixelKey({ ...settings, id: settings.pixelId })]) {
    pixelLabels[pixelKey({ ...settings, id: settings.pixelId })] =
      `${settings.pixelName ?? settings.pixelId} · ${settings.pixelId}`;
  }

  const save = async () => {
    const [adAccountId, pixelId] = pixel.split('|');
    if (!adAccountId || !pixelId) return;
    setSaving(true);
    setError(null);
    try {
      await saveCapiSettings({
        brandId,
        adAccountId,
        pixelId,
        pixelName: pixels.data?.find((item) => pixelKey(item) === pixel)?.name ?? null,
        testEventCode: testCode.trim() || null,
        forwardDestinationId: forward === NO_FORWARD ? null : forward,
      });
      toast.success('Conversions API settings saved');
      await queryClient.invalidateQueries({ queryKey: capiQueryKeys.settings(brandId) });
    } catch (saveError) {
      setError(writeFailure(saveError, onForbidden, 'Could not save these settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Pixel</Label>
        {pixels.isPending ? (
          <Skeleton className="h-8 w-72" />
        ) : pixels.isError ? (
          <PanelError
            message={capiErrorMessage(
              pixels.error,
              'Could not list pixels. Check the Meta connection above.',
            )}
          />
        ) : pixels.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No pixels on this brand&rsquo;s Meta ad accounts.
          </p>
        ) : (
          <Select value={pixel} onValueChange={setPixel} disabled={readOnly}>
            <SelectTrigger className="w-full max-w-md" aria-label="Pixel">
              <SelectValue placeholder="Choose a pixel" items={pixelLabels} />
            </SelectTrigger>
            <SelectContent>
              {[...byAccount].map(([adAccountId, accountPixels]) => (
                <SelectGroup key={adAccountId}>
                  <SelectLabel>Ad account {adAccountId}</SelectLabel>
                  {accountPixels.map((item) => (
                    <SelectItem key={pixelKey(item)} value={pixelKey(item)}>
                      {item.name ?? item.id}
                      <span className="text-xs text-muted-foreground">
                        {item.id} · {lastFired(item.lastFiredTime)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={testCodeId}>Test event code</Label>
        <Input
          id={testCodeId}
          className="max-w-xs"
          value={testCode}
          disabled={readOnly}
          placeholder="TEST12345"
          onChange={(event) => setTestCode(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Copy it from Events Manager → your dataset → Test events. Events sent as a test land there
          instead of in your reporting.
        </p>
      </div>

      <ForwardDestinationField
        brandId={brandId}
        readOnly={readOnly}
        onForbidden={onForbidden}
        value={forward}
        onChange={setForward}
      />

      <PanelError message={error} />
      <Button disabled={readOnly || saving || !pixel} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

function ForwardDestinationField({
  brandId,
  readOnly,
  onForbidden,
  value,
  onChange,
}: CapiPanelProps & { value: string; onChange: (value: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ secret: string; name: string } | null>(null);

  const resources = useQuery({
    queryKey: webhookResourcesKey(brandId),
    queryFn: () => fetchAutomationWebhookResources(brandId),
    retry: false,
  });
  const destinations = resources.data?.destinations ?? [];
  const labels = {
    [NO_FORWARD]: 'Don’t forward',
    ...Object.fromEntries(destinations.map((item) => [item.id, item.name])),
  };
  const urlInvalid = url.length > 0 && !destinationUrlSchema.safeParse(url).success;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createAutomationWebhookDestination({
        brandId,
        name: name.trim() || 'Conversions API deliveries',
        url,
        method: 'POST',
      });
      setRevealed({ secret: result.signingSecret, name: result.destination.name });
      setName('');
      setUrl('');
      await queryClient.invalidateQueries({ queryKey: webhookResourcesKey(brandId) });
      onChange(result.destination.id);
    } catch (createError) {
      setError(writeFailure(createError, onForbidden, 'Could not create this destination.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>Forward delivery results to</Label>
      <Select value={value} onValueChange={onChange} disabled={readOnly}>
        <SelectTrigger className="w-full max-w-md" aria-label="Forwarding destination">
          <SelectValue items={labels} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_FORWARD}>Don&rsquo;t forward</SelectItem>
          {destinations.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
              <span className="text-xs text-muted-foreground">{item.url}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        After each delivery Continuum POSTs the result there, signed: event counts, status and
        Meta&rsquo;s trace id. No customer data is included.
      </p>
      {resources.isError ? (
        <PanelError
          message={capiErrorMessage(resources.error, 'Could not load webhook destinations.')}
        />
      ) : null}

      {revealed ? (
        <RevealOnceSecret
          secret={revealed.secret}
          subject={`destination “${revealed.name}”`}
          onDismiss={() => setRevealed(null)}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-2 pt-1">
          <Input
            className="w-48"
            value={name}
            disabled={readOnly || busy}
            placeholder="New destination name"
            aria-label="New destination name"
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            type="url"
            className="w-72"
            value={url}
            disabled={readOnly || busy}
            placeholder="https://hooks.example.com/capi"
            aria-label="New destination URL"
            aria-invalid={urlInvalid}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={readOnly || busy || url.length === 0 || urlInvalid}
            onClick={() => void create()}
          >
            Create destination
          </Button>
        </div>
      )}
      {urlInvalid ? (
        <PanelError message="Enter a public HTTPS URL, for example https://hooks.example.com/capi." />
      ) : null}
      <PanelError message={error} />
    </div>
  );
}
