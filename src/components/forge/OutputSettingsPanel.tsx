'use client';

import {
  type ApiRenderTemplateContract,
  compactEncodeBlock,
  type EncodeBlock,
  type EncodeSettingKey,
  type EncodeSettings,
  encodeContainerOf,
  flattenEncodeSettings,
  mergeEncodeSettings,
  unflattenEncodeSettings,
} from '@continuum/contracts';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { templateBindingFor } from '@/components/forge/templateBinding';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast-imperative';
import { http } from '@/lib/api/http';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Output settings — frame rate, audio and video quality — for a template's renders.
//
// The template default applies to every output; an output's own settings win over it. Nothing
// set keeps the fleet's default, which is what every render got before these existed. The same
// field components edit a single render's override in the render-requests grid.

type Container = 'mp4' | 'mov';
type Leaf = string | number | boolean;
type Output = ApiRenderTemplateContract['outputs'][number];

const rate = (value: number) => String(Math.round(value * 1000) / 1000);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const FIELDS: Array<{
  key: EncodeSettingKey;
  label: string;
  values: (containers: Container[]) => Leaf[];
  text?: (value: Leaf, frameRate: number | null | undefined) => string;
}> = [
  {
    key: 'fps',
    label: 'Frame rate',
    values: () => ['comp', '24000/1001', 24, 25, '30000/1001', 30, 50, '60000/1001', 60],
    text: (value, frameRate) =>
      value === 'comp'
        ? `Match comp${frameRate ? ` (${rate(frameRate)})` : ''}`
        : typeof value === 'string' && value.includes('/')
          ? rate(Number(value.split('/')[0]) / Number(value.split('/')[1]))
          : String(value),
  },
  {
    key: 'audio.enabled',
    label: 'Audio',
    values: () => [true, false],
    text: (value) => (value ? 'On' : 'Off'),
  },
  {
    key: 'audio.codec',
    label: 'Audio codec',
    values: (containers) => [
      'aac',
      ...(containers.includes('mov') ? ['pcm_s16le', 'pcm_s24le'] : []),
    ],
  },
  {
    key: 'audio.bitrate',
    label: 'Audio bitrate',
    values: () => ['64k', '96k', '128k', '192k', '256k', '320k'],
  },
  {
    key: 'audio.sampleRate',
    label: 'Sample rate',
    values: () => [44100, 48000],
    text: (value) => `${Number(value) / 1000} kHz`,
  },
  {
    key: 'audio.channels',
    label: 'Channels',
    values: () => range(1, 8),
    text: (value) => (value === 1 ? '1 (mono)' : value === 2 ? '2 (stereo)' : String(value)),
  },
  {
    key: 'video.crf',
    label: 'Quality (CRF)',
    values: (containers) => (containers.includes('mp4') ? range(10, 40) : []),
  },
  {
    key: 'video.pixFmt',
    label: 'Pixel format',
    values: (containers) => [
      ...(containers.includes('mp4') ? ['yuv420p', 'yuv422p', 'yuv444p'] : []),
      ...(containers.includes('mov') ? ['yuva444p12le', 'yuv422p10le', 'yuv444p10le'] : []),
    ],
  },
  {
    key: 'video.proresProfile',
    label: 'ProRes profile',
    values: (containers) =>
      containers.includes('mov') ? ['4444', '4444xq', 'hq', 'standard', 'lt', 'proxy'] : [],
  },
];

const textOf = (key: EncodeSettingKey, value: Leaf, frameRate?: number | null) =>
  FIELDS.find((field) => field.key === key)?.text?.(value, frameRate) ?? String(value);

/** Which containers' knobs an output shows. Unknown (an older forge) shows both; a still, none. */
export function containersOf(output: Pick<Output, 'mediaType'>): Container[] {
  if (output.mediaType == null) return ['mp4', 'mov'];
  const container = encodeContainerOf(output.mediaType);
  return container ? [container] : [];
}

export function setEncodeLeaf(
  settings: EncodeSettings | undefined,
  key: EncodeSettingKey,
  value: Leaf | undefined,
): EncodeSettings | undefined {
  const flat = flattenEncodeSettings(settings);
  if (value === undefined) delete flat[key];
  else flat[key] = value;
  return unflattenEncodeSettings(flat);
}

/** A block's scope: `all` is the default, anything else an output id. */
export function withEncodeScope<T>(
  block: { default?: T; outputs?: Record<string, T> } | undefined,
  scope: string,
  value: T | undefined,
): { default?: T; outputs?: Record<string, T> } {
  if (scope === 'all') {
    const { default: _, ...rest } = block ?? {};
    return value === undefined ? rest : { ...rest, default: value };
  }
  const { [scope]: _, ...outputs } = block?.outputs ?? {};
  return { ...block, outputs: value === undefined ? outputs : { ...outputs, [scope]: value } };
}

/** "25 fps · 48 kHz · 1 (mono)" — the short form a grid cell can hold. */
export function describeEncodeSettings(settings: EncodeSettings | undefined): string {
  return Object.entries(flattenEncodeSettings(settings))
    .map(([key, value]) =>
      key === 'fps' ? `${textOf('fps', value)} fps` : textOf(key as EncodeSettingKey, value),
    )
    .join(' · ');
}

export function EncodeSettingsFields({
  settings,
  inherited,
  containers,
  frameRate,
  cleared = [],
  onSet,
  onClear,
}: {
  /** Authored at this scope. */
  settings: EncodeSettings | undefined;
  /** What applies when a field is unset — one entry per container or source, shown as its placeholder. */
  inherited: Array<EncodeSettings | undefined>;
  containers: Container[];
  frameRate?: number | null;
  cleared?: EncodeSettingKey[];
  /** `undefined` resets the field to inherited. */
  onSet: (key: EncodeSettingKey, value: Leaf | undefined) => void;
  /** Blank an inherited value back to the template. Only a draft child can. */
  onClear?: (key: EncodeSettingKey) => void;
}) {
  if (containers.length === 0) {
    return <p className="text-xs text-muted-foreground">Stills take no output settings.</p>;
  }
  const own = flattenEncodeSettings(settings);
  const from = inherited.map((item) => flattenEncodeSettings(item));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map((field) => {
        const values = field.values(containers);
        if (values.length === 0) return null;
        const current = own[field.key];
        if (current !== undefined && !values.includes(current)) values.push(current);
        const fallback = [
          ...new Set(
            from.flatMap((flat) =>
              flat[field.key] === undefined ? [] : [textOf(field.key, flat[field.key]!, frameRate)],
            ),
          ),
        ];
        const isCleared = cleared.includes(field.key);
        const placeholder = isCleared
          ? 'Cleared (template)'
          : `Inherited${fallback.length ? `: ${fallback.join(' / ')}` : ' (fleet default)'}`;
        return (
          <div key={field.key} className="flex items-end gap-1">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{field.label}</span>
              <select
                aria-label={field.label}
                value={current === undefined ? '' : String(current)}
                onChange={(event) =>
                  onSet(
                    field.key,
                    event.target.value === ''
                      ? undefined
                      : values.find((value) => String(value) === event.target.value),
                  )
                }
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{placeholder}</option>
                {values.map((value) => (
                  <option key={String(value)} value={String(value)}>
                    {textOf(field.key, value, frameRate)}
                  </option>
                ))}
              </select>
            </label>
            {current !== undefined || isCleared ? (
              <button
                type="button"
                className="mb-1.5 rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
                aria-label={`Reset ${field.label} to inherited`}
                title="Reset to inherited"
                onClick={() => onSet(field.key, undefined)}
              >
                <RotateCcw className="size-3" aria-hidden />
              </button>
            ) : onClear && fallback.length ? (
              <button
                type="button"
                className="mb-1.5 rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
                aria-label={`Clear inherited ${field.label}`}
                title="Clear inherited value"
                onClick={() => onClear(field.key)}
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function OutputSettingsPanel({
  brandId,
  templateKey,
}: {
  brandId: string;
  templateKey: string;
}) {
  const [contract, setContract] = useState<ApiRenderTemplateContract | null>(null);
  const [draft, setDraft] = useState<EncodeBlock>({});
  const [scope, setScope] = useState('all');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { bindingId, several } = await templateBindingFor(brandId, templateKey);
      const next = await apiRendersApi.getContract(
        brandId,
        templateKey,
        several ? bindingId : null,
      );
      setContract(next);
      setDraft(next.encode?.stored ?? {});
    } catch (error) {
      // Logged, not shown: this panel exists only for a contract that carries output settings,
      // and a template whose contract cannot be read has none to show.
      console.warn('[OutputSettingsPanel] could not read the template contract', error);
    }
  }, [brandId, templateKey]);

  useEffect(() => {
    setScope('all');
    void load();
  }, [load]);

  if (!contract?.encode) return null;
  const { defaults, stored } = contract.encode;
  const outputs = contract.outputs;
  const all: Container[] = outputs.length
    ? [...new Set(outputs.flatMap(containersOf))]
    : ['mp4', 'mov'];
  const output = outputs.find((item) => item.id === scope);
  const containers = output ? containersOf(output) : all;
  const settings = output ? draft.outputs?.[output.id] : draft.default;
  const inherited = output
    ? containers.map((container) => mergeEncodeSettings(defaults[container], draft.default))
    : containers.map((container) => defaults[container]);
  const dirty =
    JSON.stringify(compactEncodeBlock(draft) ?? null) !==
    JSON.stringify(compactEncodeBlock(stored ?? undefined) ?? null);

  const save = async () => {
    setSaving(true);
    try {
      await http.request({
        path: `/api/ai-studio/templates/${encodeURIComponent(templateKey)}/encode`,
        method: 'PUT',
        body: { brandId, encode: compactEncodeBlock(draft) ?? {} },
      });
      await load();
      toast.success('Output settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save output settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={scope} onValueChange={(next) => setScope(String(next))}>
          <TabsList>
            <TabsTrigger value="all">All outputs</TabsTrigger>
            {outputs.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={save}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </div>
      <EncodeSettingsFields
        key={scope}
        settings={settings}
        inherited={inherited}
        containers={containers}
        frameRate={output?.frameRate}
        onSet={(key, value) =>
          setDraft((current) => {
            const scoped = output ? current.outputs?.[output.id] : current.default;
            return withEncodeScope(current, scope, setEncodeLeaf(scoped, key, value));
          })
        }
      />
    </div>
  );
}
