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
  isMotion,
  mergeEncodeSettings,
  unflattenEncodeSettings,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { useFormatter, useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
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
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';

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

const FILE_LABEL: Record<EncodeFileContainer, string> = {
  mp4: 'MP4',
  mov: 'MOV (ProRes)',
  mxf: 'MXF',
  webm: 'WebM (VP9)',
  gif: 'GIF (loop)',
};

/** The `<Select>` value that stands for "unset — inherit". Never a real setting's spelling. */
const INHERIT = '__inherit__';
/** The style `<Select>` value for a file mix no style names. */
const CUSTOM = '__custom__';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const onAny = (files: EncodeFileContainer[], ...wanted: EncodeFileContainer[]) =>
  wanted.some((file) => files.includes(file));

// `values` sees the files this scope actually makes, so each container's knobs show only while
// its file is on: CRF for MP4, the ProRes profile for MOV, PCM audio for MOV and MXF.
type ForgeTranslator = ReturnType<typeof useUiTranslations<'forge'>>;
type FieldKey = keyof typeof import('../../../messages/forge/en.json');

const FIELDS: Array<{
  key: EncodeSettingKey;
  labelKey: FieldKey;
  values: (files: EncodeFileContainer[]) => Leaf[];
}> = [
  {
    key: 'fps',
    labelKey: 'fieldFps',
    values: () => ['comp', '24000/1001', 24, 25, '30000/1001', 30, 50, '60000/1001', 60],
  },
  { key: 'audio.enabled', labelKey: 'fieldAudioEnabled', values: () => [true, false] },
  {
    key: 'video.mxfProfile',
    labelKey: 'fieldMxfProfile',
    values: (files) => (files.includes('mxf') ? ['dnxhr-hq', 'xdcam-hd422-1080i5994'] : []),
  },
  {
    key: 'audio.layout',
    labelKey: 'fieldAudioLayout',
    values: (files) => (files.includes('mxf') ? ['broadcast-4x-aes3', 'stereo'] : []),
  },
  {
    key: 'audio.codec',
    labelKey: 'fieldAudioCodec',
    values: (files) => [
      ...(onAny(files, 'mp4', 'mov') ? ['aac'] : []),
      ...(files.includes('mov') ? ['pcm_s16le', 'pcm_s24le'] : []),
    ],
  },
  {
    key: 'audio.bitrate',
    labelKey: 'fieldAudioBitrate',
    values: (files) =>
      onAny(files, 'mp4', 'mov') ? ['64k', '96k', '128k', '192k', '256k', '320k'] : [],
  },
  {
    key: 'audio.sampleRate',
    labelKey: 'fieldSampleRate',
    values: (files) => (onAny(files, 'mp4', 'mov', 'webm') ? [44100, 48000] : []),
  },
  {
    key: 'audio.channels',
    labelKey: 'fieldChannels',
    values: (files) => (onAny(files, 'mp4', 'mov', 'webm') ? range(1, 8) : []),
  },
  {
    key: 'video.crf',
    labelKey: 'fieldQuality',
    values: (files) => (files.includes('mp4') ? range(10, 40) : []),
  },
  {
    key: 'video.pixFmt',
    labelKey: 'fieldPixelFormat',
    values: (files) => [
      ...(files.includes('mp4') ? ['yuv420p', 'yuv422p', 'yuv444p'] : []),
      ...(files.includes('mov') ? ['yuva444p12le', 'yuv422p10le', 'yuv444p10le'] : []),
    ],
  },
  {
    key: 'video.proresProfile',
    labelKey: 'fieldProresProfile',
    values: (files) =>
      files.includes('mov') ? ['4444', '4444xq', 'hq', 'standard', 'lt', 'proxy'] : [],
  },
];

function textOf(
  key: EncodeSettingKey,
  value: Leaf,
  frameRate: number | null | undefined,
  t: ForgeTranslator,
  number: (value: number) => string,
): string {
  if (key === 'fps') {
    if (value === 'comp')
      return frameRate ? t('matchCompRate', { rate: number(frameRate) }) : t('matchComp');
    const [numerator, denominator] = String(value).split('/').map(Number);
    return `${number(denominator ? numerator! / denominator : Number(value))} fps`;
  }
  if (key === 'audio.enabled') return t(value ? 'on' : 'off');
  if (key === 'video.mxfProfile')
    return value === 'xdcam-hd422-1080i5994' ? 'XDCAM HD422 · 1080i59.94' : t('dnxhrProgressive');
  if (key === 'audio.layout') return t(value === 'stereo' ? 'stereo' : 'broadcastAes3');
  if (key === 'audio.sampleRate') return `${number(Number(value) / 1000)} kHz`;
  if (key === 'audio.channels' && (value === 1 || value === 2))
    return t(value === 1 ? 'monoChannels' : 'stereoChannels', { count: number(Number(value)) });
  return typeof value === 'number' ? number(value) : String(value);
}

const STYLE_COPY = {
  web: { label: 'styleWeb', description: 'styleWebDescription' },
  broadcast: { label: 'styleBroadcast', description: 'styleBroadcastDescription' },
  'edit-master': { label: 'styleEditMaster', description: 'styleEditMasterDescription' },
  'open-web': { label: 'styleOpenWeb', description: 'styleOpenWebDescription' },
  'social-loop': { label: 'styleSocialLoop', description: 'styleSocialLoopDescription' },
} as const;

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
  return motion != null && !isMotion(motion.durationSec, motion.frameRate);
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
  const translateUi = useUiTranslations('forge');
  const formatter = useFormatter();
  const formatNumber = (value: number) => formatter.number(value, { maximumFractionDigits: 3 });
  const fileLabel = (file: EncodeFileContainer) =>
    file === 'gif' ? translateUi('gifLoop') : FILE_LABEL[file];

  if (inherited.length === 0) {
    return <p className="text-xs text-muted-foreground">{translateUi('stillsNote')}</p>;
  }
  const own = flattenEncodeSettings(settings);
  const from = inherited.map((item) => flattenEncodeSettings(item.settings));
  const filesPer = inherited.map(({ container, settings: base }) =>
    encodeFilesOf(mergeEncodeSettings(base, settings), container),
  );
  const filesOn = ENCODE_FILE_CONTAINERS.filter((file) => filesPer.some((f) => f.includes(file)));
  const effectiveMxf = inherited.flatMap(({ settings: base }, index) =>
    filesPer[index]?.includes('mxf') ? [mergeEncodeSettings(base, settings)] : [],
  );
  const mxfAudioOff = effectiveMxf.every((effective) => effective?.audio?.enabled === false);
  const mxfAudio = [
    ...new Set(
      effectiveMxf.map((effective) =>
        translateUi(
          effective?.audio?.enabled === false
            ? 'mxfNoAudio'
            : effective?.audio?.layout === 'stereo'
              ? 'mxfStereoAudio'
              : 'mxfMonoAudio',
        ),
      ),
    ),
  ];
  const mxfVideo = [
    ...new Set(
      effectiveMxf.map((effective) =>
        effective?.video?.mxfProfile === 'xdcam-hd422-1080i5994'
          ? 'XDCAM HD422 · 1080i59.94 · 50 Mb/s'
          : translateUi('dnxhrProgressive'),
      ),
    ),
  ];
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
        <span className="text-muted-foreground">{translateUi('outputStyle')}</span>
        <Select value={style?.id ?? CUSTOM} onValueChange={(next) => applyStyle(String(next))}>
          <SelectTrigger aria-label={translateUi('outputStyle')} className="w-full">
            <SelectValue>
              {(value: unknown) => (
                <span className="truncate">
                  {(() => {
                    const selected = ENCODE_STYLES.find((item) => item.id === value);
                    return selected
                      ? translateUi(STYLE_COPY[selected.id].label)
                      : translateUi('customMix');
                  })()}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENCODE_STYLES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <span className="flex flex-col">
                  <span>{translateUi(STYLE_COPY[item.id].label)}</span>
                  <span className="text-xs text-muted-foreground">
                    {translateUi(STYLE_COPY[item.id].description)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="flex flex-col gap-1.5 text-xs sm:col-span-2">
        <legend className="mb-1 text-muted-foreground">{translateUi('files_abc7e989')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {ENCODE_FILE_CONTAINERS.map((file) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control.
            <label key={file} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={fileState(file)}
                disabled={file === lastFile && fileState(file) === true}
                onCheckedChange={() => toggleFile(file)}
              />
              {fileLabel(file)}
            </label>
          ))}
        </div>
        {lastFile && fileState(lastFile) === true ? (
          <p className="text-muted-foreground">
            {translateUi('lastFileRequired', { file: fileLabel(lastFile) })}
          </p>
        ) : null}
      </fieldset>
      {filesOn.includes('mxf') ? (
        <div className="flex flex-col gap-1 text-xs sm:col-span-2" aria-live="polite">
          <p className="m-0">
            <span className="font-medium">{translateUi('mxfVideoLabel')} </span>
            {mxfVideo.join(' / ')}
          </p>
          <p className="m-0">
            <span className="font-medium">{translateUi('mxfAudioLabel')} </span>
            {mxfAudio.join(' / ')}
          </p>
          <p className="m-0 text-muted-foreground">
            {translateUi(mxfAudioOff ? 'mxfNoAudioNote' : 'mxfBroadcastNote')}
          </p>
          {mxfVideo.some((video) => video.includes('1080i59.94')) ? (
            <p className="m-0 text-muted-foreground">{translateUi('mxfInterlacedNote')}</p>
          ) : null}
        </div>
      ) : null}
      {FIELDS.map((field) => {
        const values = field.values(filesOn);
        if (values.length === 0) return null;
        const current = own[field.key];
        // A value set elsewhere (the API, an older build) stays visible even off the standard list.
        if (current !== undefined && !values.includes(current)) values.push(current);
        const fallback = [
          ...new Set(
            from.flatMap((flat) =>
              flat[field.key] === undefined
                ? []
                : [textOf(field.key, flat[field.key]!, frameRate, translateUi, formatNumber)],
            ),
          ),
        ];
        if (field.key === 'audio.layout' && fallback.length === 0)
          fallback.push(translateUi('broadcastAes3'));
        if (field.key === 'video.mxfProfile' && fallback.length === 0)
          fallback.push(translateUi('dnxhrProgressive'));
        const isCleared = cleared.includes(field.key);
        const placeholder = isCleared
          ? translateUi('clearedTemplate')
          : fallback.length
            ? translateUi('inheritedValue', { value: fallback.join(' / ') })
            : translateUi('fleetDefault');
        // Pairs, not a record: a record would hoist integer-like keys (`24`, `25`) above `comp`.
        const options: Array<[string, string]> = [
          [INHERIT, placeholder],
          ...values.map((value): [string, string] => [
            String(value),
            textOf(field.key, value, frameRate, translateUi, formatNumber),
          ]),
        ];
        const labels = Object.fromEntries(options);
        return (
          <div key={field.key} className="flex items-end gap-1">
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{translateUi(field.labelKey)}</span>
              <Select
                value={current === undefined ? INHERIT : String(current)}
                onValueChange={(next) =>
                  onSet({
                    ...(field.key === 'video.mxfProfile' && next === 'xdcam-hd422-1080i5994'
                      ? { fps: 'comp' }
                      : {}),
                    [field.key]:
                      next === INHERIT ? undefined : values.find((value) => String(value) === next),
                  })
                }
              >
                <SelectTrigger aria-label={translateUi(field.labelKey)} className="w-full">
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
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="mb-1.5 text-muted-foreground"
                aria-label={translateUi('resetField', { field: translateUi(field.labelKey) })}
                title={translateUi('reset_to_inherited_af537e74')}
                onClick={() => onSet({ [field.key]: undefined })}
              >
                <RotateCcw className="size-3" aria-hidden />
              </Button>
            ) : onClear && fallback.length ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="mb-1.5 text-muted-foreground"
                aria-label={translateUi('clearField', { field: translateUi(field.labelKey) })}
                title={translateUi('clear_inherited_value_6a234cfc')}
                onClick={() => onClear(field.key)}
              >
                <X className="size-3" aria-hidden />
              </Button>
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
  bindingId,
}: {
  brandId: string;
  templateKey: string;
  /** Read off the template row. A key alone is ambiguous — 133 exists in two sub-apps. */
  bindingId: string | null;
}) {
  const translateUi = useUiTranslations('forge');

  const queryClient = useQueryClient();
  const [contract, setContract] = useState<ApiRenderTemplateContract | null>(null);
  const [draft, setDraft] = useState<EncodeBlock>({});
  const [scope, setScope] = useState('all');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await queryClient.fetchQuery({
        queryKey: forgeQueryKeys.contract(brandId, bindingId, templateKey),
        queryFn: () => apiRendersApi.getContract(brandId, templateKey, bindingId),
        staleTime: FORGE_STALE_MS.contract,
      });
      setContract(next);
      setDraft(next.encode?.stored ?? {});
    } catch (error) {
      // Logged, not shown: this panel exists only for a contract that carries output settings,
      // and a template whose contract cannot be read has none to show.
      console.warn('[OutputSettingsPanel] could not read the template contract', error);
    }
  }, [brandId, templateKey, bindingId, queryClient]);

  useEffect(() => {
    setScope('all');
    void load();
  }, [load]);

  if (!contract) return null;
  if (isStillsOnly(contract))
    return <p className="text-xs text-muted-foreground">{translateUi('stillsNote')}</p>;
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
      await queryClient.invalidateQueries({
        queryKey: forgeQueryKeys.contract(brandId, bindingId, templateKey),
      });
      await load();
      toast.success(translateUi('output_settings_saved_a52d1afa'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_save_output_settings_a0e9c4cf'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={scope} onValueChange={(next) => setScope(String(next))}>
          <TabsList>
            <TabsTrigger value="all">{translateUi('all_outputs_61deb5b9')}</TabsTrigger>
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
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}{' '}
          {translateUi('save_1509f561')}{' '}
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
