'use client';

import {
  type ApiRenderTemplateContract,
  compactEncodeBlock,
  ENCODE_FILE_CONTAINERS,
  ENCODE_STYLES,
  type EncodeBlock,
  type EncodeFileContainer,
  type EncodeSettingKey,
  type EncodeSettings,
  encodeContainerOf,
  encodeFilesOf,
  encodeStyleFiles,
  encodeStyleOf,
  flattenEncodeSettings,
  mergeEncodeSettings,
  unflattenEncodeSettings,
} from '@continuum/contracts';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { templateBindingFor } from '@/components/forge/templateBinding';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast-imperative';
import { http } from '@/lib/api/http';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Output settings — frame rate, files, audio and video quality — for a template's renders.
//
// The template default applies to every output; an output's own settings win over it. Nothing
// set keeps the fleet's default, which is what every render got before these existed. The same
// field components edit a single render's override in the render-requests grid.

type Container = 'mp4' | 'mov';
type Leaf = string | number | boolean;
/** Leaves to change at once; `undefined` resets a leaf to inherited. */
export type EncodeLeafChanges = Partial<Record<EncodeSettingKey, Leaf | undefined>>;
type Output = ApiRenderTemplateContract['outputs'][number];

/** One container in scope and what applies to it when a field is unset. */
export type InheritedEncode = { container: Container; settings: EncodeSettings | undefined };

export const STILLS_NOTE =
  'Stills take no output settings. Frame rate and files apply to animated formats.';

const FILE_LABEL: Record<EncodeFileContainer, string> = {
  mp4: 'MP4',
  mov: 'MOV (ProRes)',
  mxf: 'MXF (DNxHR)',
  webm: 'WebM (VP9)',
  gif: 'GIF (loop)',
};

/** The `<Select>` value that stands for "unset — inherit". Never a real setting's spelling. */
const INHERIT = '__inherit__';
/** The style `<Select>` value for a file mix no style names. */
const CUSTOM = '__custom__';

const rate = (value: number) => String(Math.round(value * 1000) / 1000);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const onAny = (files: EncodeFileContainer[], ...wanted: EncodeFileContainer[]) =>
  wanted.some((file) => files.includes(file));

// `values` sees the files this scope actually makes, so each container's knobs show only while
// its file is on: CRF for MP4, the ProRes profile for MOV, PCM audio for MOV and MXF.
const FIELDS: Array<{
  key: EncodeSettingKey;
  label: string;
  values: (files: EncodeFileContainer[]) => Leaf[];
  text?: (value: Leaf, frameRate: number | null | undefined) => string;
}> = [
  {
    key: 'fps',
    label: 'Frame rate',
    values: () => ['comp', '24000/1001', 24, 25, '30000/1001', 30, 50, '60000/1001', 60],
    text: (value, frameRate) =>
      value === 'comp'
        ? `Match the comp${frameRate ? ` (${rate(frameRate)} fps)` : ''}`
        : typeof value === 'string' && value.includes('/')
          ? `${rate(Number(value.split('/')[0]) / Number(value.split('/')[1]))} fps`
          : `${value} fps`,
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
    values: (files) => [
      ...(onAny(files, 'mp4', 'mov') ? ['aac'] : []),
      ...(onAny(files, 'mov', 'mxf') ? ['pcm_s16le', 'pcm_s24le'] : []),
    ],
  },
  {
    key: 'audio.bitrate',
    label: 'Audio bitrate',
    // A bitrate is an AAC knob; PCM has none.
    values: (files) =>
      onAny(files, 'mp4', 'mov') ? ['64k', '96k', '128k', '192k', '256k', '320k'] : [],
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
    values: (files) => (files.includes('mp4') ? range(10, 40) : []),
  },
  {
    key: 'video.pixFmt',
    label: 'Pixel format',
    values: (files) => [
      ...(files.includes('mp4') ? ['yuv420p', 'yuv422p', 'yuv444p'] : []),
      ...(files.includes('mov') ? ['yuva444p12le', 'yuv422p10le', 'yuv444p10le'] : []),
    ],
  },
  {
    key: 'video.proresProfile',
    label: 'ProRes profile',
    values: (files) =>
      files.includes('mov') ? ['4444', '4444xq', 'hq', 'standard', 'lt', 'proxy'] : [],
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

/**
 * A template that renders nothing but stills. Its outputs say so by encoder when the forge names
 * one; a template with no named outputs says so by its longest delivery comp running one frame.
 */
export function isStillsOnly(contract: Pick<ApiRenderTemplateContract, 'outputs' | 'template'>) {
  const named = contract.outputs.filter((output) => output.mediaType != null);
  if (named.length) return named.every((output) => !encodeContainerOf(output.mediaType));
  const motion = contract.template.motion;
  return motion != null && Math.round(motion.durationSec * motion.frameRate) <= 1;
}

export function setEncodeLeaves(
  settings: EncodeSettings | undefined,
  changes: EncodeLeafChanges,
): EncodeSettings | undefined {
  const flat = flattenEncodeSettings(settings);
  for (const [key, value] of Object.entries(changes) as Array<
    [EncodeSettingKey, Leaf | undefined]
  >) {
    if (value === undefined) delete flat[key];
    else flat[key] = value;
  }
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

export function EncodeSettingsFields({
  settings,
  inherited,
  frameRate,
  cleared = [],
  onSet,
  onClear,
}: {
  /** Authored at this scope. */
  settings: EncodeSettings | undefined;
  /**
   * Each container in scope and what it inherits — shown as a field's placeholder, and the files
   * it makes. Empty means every output in scope is a still.
   */
  inherited: InheritedEncode[];
  frameRate?: number | null;
  cleared?: EncodeSettingKey[];
  /** Every leaf in one call, so a style's five files land together. */
  onSet: (changes: EncodeLeafChanges) => void;
  /** Blank an inherited value back to the template. Only a draft child can. */
  onClear?: (key: EncodeSettingKey) => void;
}) {
  if (inherited.length === 0) {
    return <p className="text-xs text-muted-foreground">{STILLS_NOTE}</p>;
  }
  const own = flattenEncodeSettings(settings);
  const from = inherited.map((item) => flattenEncodeSettings(item.settings));
  const filesPer = inherited.map(({ container, settings: base }) =>
    encodeFilesOf(mergeEncodeSettings(base, settings), container),
  );
  const filesOn = ENCODE_FILE_CONTAINERS.filter((file) => filesPer.some((f) => f.includes(file)));
  const fileState = (file: EncodeFileContainer) => {
    const on = filesPer.filter((files) => files.includes(file)).length;
    return on === filesPer.length ? true : on ? ('indeterminate' as const) : false;
  };
  // The one file a container still makes cannot be turned off: a render must deliver something.
  const lastFile = filesPer.find((files) => files.length === 1)?.[0];
  // A leaf the scope already inherits is left unset, so the template can still change it later.
  const fileLeaf = (file: EncodeFileContainer, on: boolean) =>
    inherited.every(
      ({ container, settings: base }) => encodeFilesOf(base, container).includes(file) === on,
    )
      ? undefined
      : on;
  const toggleFile = (file: EncodeFileContainer) => {
    onSet({ [`files.${file}`]: fileLeaf(file, fileState(file) !== true) });
  };
  const sameFiles = filesPer.every((files) => files.join() === filesPer[0]?.join());
  const style = sameFiles && filesPer[0] ? encodeStyleOf(filesPer[0]) : null;
  const applyStyle = (id: string) => {
    const target = ENCODE_STYLES.find((item) => item.id === id);
    if (!target) return;
    const files = encodeStyleFiles(target);
    onSet(
      Object.fromEntries(
        ENCODE_FILE_CONTAINERS.map((file) => [
          `files.${file}`,
          fileLeaf(file, files[file] === true),
        ]),
      ),
    );
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="flex flex-col gap-1 text-xs sm:col-span-2">
        <span className="text-muted-foreground">Output style</span>
        <Select value={style?.id ?? CUSTOM} onValueChange={(next) => applyStyle(String(next))}>
          <SelectTrigger aria-label="Output style" className="w-full">
            <SelectValue>
              {(value: unknown) => (
                <span className="truncate">
                  {ENCODE_STYLES.find((item) => item.id === value)?.label ?? 'Custom mix'}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENCODE_STYLES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <span className="flex flex-col">
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="flex flex-col gap-1.5 text-xs sm:col-span-2">
        <legend className="mb-1 text-muted-foreground">Files</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {ENCODE_FILE_CONTAINERS.map((file) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control.
            <label key={file} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={fileState(file)}
                disabled={file === lastFile && fileState(file) === true}
                onCheckedChange={() => toggleFile(file)}
              />
              {FILE_LABEL[file]}
            </label>
          ))}
        </div>
        {lastFile && fileState(lastFile) === true ? (
          <p className="text-muted-foreground">
            {FILE_LABEL[lastFile]} stays on: every render delivers at least one file.
          </p>
        ) : null}
      </fieldset>
      {FIELDS.map((field) => {
        const values = field.values(filesOn);
        if (values.length === 0) return null;
        const current = own[field.key];
        // A value set elsewhere (the API, an older build) stays visible even off the standard list.
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
          : fallback.length
            ? `Inherited: ${fallback.join(' / ')}`
            : 'Fleet default';
        // Pairs, not a record: a record would hoist integer-like keys (`24`, `25`) above `comp`.
        const options: Array<[string, string]> = [
          [INHERIT, placeholder],
          ...values.map((value): [string, string] => [
            String(value),
            textOf(field.key, value, frameRate),
          ]),
        ];
        const labels = Object.fromEntries(options);
        return (
          <div key={field.key} className="flex items-end gap-1">
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{field.label}</span>
              <Select
                value={current === undefined ? INHERIT : String(current)}
                onValueChange={(next) =>
                  onSet({
                    [field.key]:
                      next === INHERIT ? undefined : values.find((value) => String(value) === next),
                  })
                }
              >
                <SelectTrigger aria-label={field.label} className="w-full">
                  <SelectValue>
                    {(value: unknown) =>
                      value === INHERIT ? (
                        <span className="truncate text-muted-foreground">{placeholder}</span>
                      ) : (
                        <span className="truncate">{labels[String(value)] ?? String(value)}</span>
                      )
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {current !== undefined || isCleared ? (
              <button
                type="button"
                className="mb-1.5 rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
                aria-label={`Reset ${field.label} to inherited`}
                title="Reset to inherited"
                onClick={() => onSet({ [field.key]: undefined })}
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

  if (!contract) return null;
  if (isStillsOnly(contract)) return <p className="text-xs text-muted-foreground">{STILLS_NOTE}</p>;
  if (!contract.encode) return null;
  const { defaults, stored } = contract.encode;
  const outputs = contract.outputs;
  const all: Container[] = outputs.length
    ? [...new Set(outputs.flatMap(containersOf))]
    : ['mp4', 'mov'];
  const output = outputs.find((item) => item.id === scope);
  const settings = output ? draft.outputs?.[output.id] : draft.default;
  const inherited: InheritedEncode[] = output
    ? containersOf(output).map((container) => ({
        container,
        settings: mergeEncodeSettings(defaults[container], draft.default),
      }))
    : all.map((container) => ({ container, settings: defaults[container] }));
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
        frameRate={output?.frameRate}
        onSet={(changes) =>
          setDraft((current) => {
            const scoped = output ? current.outputs?.[output.id] : current.default;
            return withEncodeScope(current, scope, setEncodeLeaves(scoped, changes));
          })
        }
      />
    </div>
  );
}
