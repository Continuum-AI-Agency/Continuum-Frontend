'use client';

import {
  CLIP_MOTION_PRESET_IDS,
  CLIP_MOTION_PRESETS,
  type ClipMotionPresetId,
  type EditorEffectInstance,
  type EditorOverlayClip,
  type EditorVideoClip,
  LOOK_EFFECT_IDS,
  LOOK_EFFECTS,
  type LookEffectId,
  lookEffectInstance,
} from '@continuum/contracts';
import { X } from 'lucide-react';
import { useTranslations, useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useRef, useState, useMemo as useUiConfigMemo } from 'react';
import { Button } from '@/components/ui/button';
import { SliderField } from '@/components/ui/slider-field';
import { useToast } from '@/components/ui/ToastProvider';
import type { RunVideoEditorOp } from '@/components/video-studio/types';
import { cn } from '@/lib/utils';
import { useStudioMetadata } from '@/StudioCanvas/hooks/useStudioMetadata';
import type { KeyedClip } from './keyframeEdits';

const SECTION = 'flex shrink-0 flex-col gap-2 rounded-lg border border-border/60 p-3';
const SECTION_LABEL = 'text-2xs font-semibold uppercase tracking-wide text-muted-foreground';
const CHIP =
  'h-6 rounded-md border px-2 text-2xs transition-colors active:scale-[0.97] disabled:opacity-50';

function useLocalPhasesMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value = [
      { phase: 'in', label: translateConfig('in_8bc1d53c') },
      { phase: 'out', label: translateConfig('out_9a3c5460') },
      { phase: 'emphasis', label: translateConfig('at_playhead_4fd9c488') },
      { phase: 'whole', label: translateConfig('whole_clip_09e01b53') },
    ] as const;
    return value;
  }, [translateConfig]);
}

/** Arrow keys commit on every press; only the value the slider settles on is applied. */
const STRENGTH_SETTLE_MS = 250;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : 'The request failed.';

/** Runs one op, reporting only failure: a success shows on the stage and the timeline. */
function useOpRunner() {
  const translateUi = useUiTranslations('studio');

  const { show } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const run = async (key: string, label: string, call: () => Promise<unknown>) => {
    setRunning(key);
    try {
      await call();
    } catch (error) {
      show({
        title: translateUi('value0_failed_afc83119', { value0: String(label) }),
        description: errorText(error),
        variant: 'error',
      });
    } finally {
      setRunning(null);
    }
  };
  return { running, run };
}

/** Motion presets from the contract's table, applied through `animate_clip`. */
export function MotionPresetsSection({
  clip,
  getPlayheadSec,
  runOp,
}: {
  clip: Exclude<KeyedClip, { kind: 'audio' }>;
  getPlayheadSec: () => number;
  runOp: RunVideoEditorOp;
}) {
  const registryText = useStudioMetadata();

  const PHASES = useLocalPhasesMessages();

  const uiText = useTranslations('common');
  const { running, run } = useOpRunner();
  const apply = (preset: ClipMotionPresetId) => {
    const { label, phase } = CLIP_MOTION_PRESETS[preset];
    // Emphasis lands at the playhead, held inside the clip it animates.
    const atSec = Math.min(
      clip.timelineStartSec + clip.durationSec,
      Math.max(clip.timelineStartSec, getPlayheadSec()),
    );
    return run(preset, label, () =>
      runOp('animate_clip', {
        clipId: clip.id,
        preset,
        ...(phase === 'emphasis' ? { atSec } : {}),
      }),
    );
  };
  return (
    <section aria-label={uiText('motion_8ca3442')} className={SECTION} data-testid="motion-presets">
      <span className={SECTION_LABEL}>{uiText('motion_8ca3442')}</span>
      {PHASES.map(({ phase, label }) => (
        <div key={phase} className="flex flex-col gap-1">
          <span className="text-3xs text-muted-foreground">{label}</span>
          <div className="flex flex-wrap gap-1">
            {CLIP_MOTION_PRESET_IDS.filter((id) => CLIP_MOTION_PRESETS[id].phase === phase).map(
              (id) => (
                <button
                  key={id}
                  type="button"
                  data-motion-preset={id}
                  disabled={running !== null}
                  className={cn(
                    CHIP,
                    running === id
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border/60 hover:border-primary/60',
                  )}
                  onClick={() => void apply(id)}
                >
                  {registryText(CLIP_MOTION_PRESETS[id].label)}
                </button>
              ),
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

const isLook = (effect: EditorEffectInstance): boolean =>
  effect.enabled && Object.hasOwn(LOOK_EFFECTS, effect.effectId);

/** A look's 0–1 strength, read back from the parameter the compositor holds. */
export function lookStrength(effect: EditorEffectInstance): number {
  if (!Object.hasOwn(LOOK_EFFECTS, effect.effectId)) return 1;
  const id = effect.effectId as LookEffectId;
  const parameter = LOOK_EFFECTS[id].parameter;
  if (!parameter) return effect.mix;
  const full = lookEffectInstance(id, { id: 'full', strength: 1 }).parameters[parameter];
  const now = effect.parameters[parameter];
  return typeof full === 'number' && typeof now === 'number' && full > 0
    ? Math.round(Math.min(1, Math.max(0, now / full)) * 100) / 100
    : 0.6;
}

/** Looks from the contract's table as chips, each at a strength, through `apply_effect`. */
export function LookSection({
  clip,
  runOp,
}: {
  clip: EditorVideoClip | EditorOverlayClip;
  runOp: RunVideoEditorOp;
}) {
  const registryText = useStudioMetadata();

  const translateUi = useUiTranslations('studio');

  const { running, run } = useOpRunner();
  const looks = clip.effects.filter(isLook);
  const [focus, setFocus] = useState<LookEffectId | null>(
    (looks.at(-1)?.effectId as LookEffectId | undefined) ?? null,
  );
  const focused = looks.find((effect) => effect.effectId === focus);
  const committed = focused ? lookStrength(focused) : 0.6;
  const [strength, setStrength] = useState(committed);
  useEffect(() => setStrength(committed), [committed]);

  const apply = (effect: LookEffectId, value: number) =>
    run(effect, registryText(LOOK_EFFECTS[effect].label), () =>
      runOp('apply_effect', { clipId: clip.id, effect, strength: value }),
    );
  // Requests race on the wire, so a burst of commits would land in any order.
  const pendingStrength = useRef<{
    timer: ReturnType<typeof setTimeout>;
    flush: () => void;
  }>(null);
  const commitStrength = (effect: LookEffectId, value: number) => {
    if (pendingStrength.current) clearTimeout(pendingStrength.current.timer);
    const flush = () => {
      pendingStrength.current = null;
      void apply(effect, value);
    };
    pendingStrength.current = {
      timer: setTimeout(flush, STRENGTH_SETTLE_MS),
      flush,
    };
  };
  // Deselecting mid-settle keeps the change.
  useEffect(
    () => () => {
      const pending = pendingStrength.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.flush();
    },
    [],
  );
  const remove = (effect: LookEffectId) =>
    run(
      effect,
      translateUi('removeLook', {
        name: registryText(LOOK_EFFECTS[effect].label),
      }),
      () => runOp('apply_effect', { clipId: clip.id, effect, remove: true }),
    );

  return (
    <section
      aria-label={translateUi('look_a0de5719')}
      className={SECTION}
      data-testid="look-section"
    >
      <span className={SECTION_LABEL}>{translateUi('look_a0de5719')}</span>
      <div className="flex flex-wrap gap-1">
        {LOOK_EFFECT_IDS.map((id) => {
          const on = looks.some((effect) => effect.effectId === id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-look={id}
              disabled={running !== null}
              className={cn(
                CHIP,
                on
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border/60 hover:border-primary/60',
                focus === id && on && 'ring-1 ring-primary',
              )}
              onClick={() => {
                setFocus(id);
                if (!on) void apply(id, strength);
              }}
            >
              {registryText(LOOK_EFFECTS[id].label)}
            </button>
          );
        })}
      </div>
      {focused && focus ? (
        <div className="flex items-end gap-2">
          <SliderField
            className="flex-1"
            label={translateUi('value0_strength_c4dfde98', {
              value0: String(registryText(LOOK_EFFECTS[focus].label)),
            })}
            value={strength}
            min={0}
            max={1}
            step={0.05}
            format={{ style: 'percent', maximumFractionDigits: 0 }}
            // Never disabled mid-run: each arrow key commits, and the edit queue keeps order.
            onChange={setStrength}
            onCommit={(value) => commitStrength(focus, value)}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={translateUi('remove_value0_3028bf7d', {
              value0: String(registryText(LOOK_EFFECTS[focus].label)),
            })}
            disabled={running !== null}
            onClick={() => void remove(focus)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
