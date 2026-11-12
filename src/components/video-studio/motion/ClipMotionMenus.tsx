'use client';

import {
  CLIP_MOTION_PRESET_IDS,
  CLIP_MOTION_PRESETS,
  type ClipMotionPresetId,
  type EditorClip,
  LOOK_EFFECT_IDS,
  LOOK_EFFECTS,
  type LookEffectId,
} from '@continuum/contracts';
import { Blend, Palette, Sparkles } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { useStudioMetadata } from '@/StudioCanvas/hooks/useStudioMetadata';
import { animates, takesLook } from './motionActions';
import { SEAM_TRANSITIONS, TRANSITION_LABELS, type TransitionType } from './TransitionSeam';

/** Each names the clip the menu opened on; the workspace widens it to the selection. */
export type MotionMenuActions = {
  animate: (clipId: string, preset: ClipMotionPresetId) => void;
  look: (clipId: string, effect: LookEffectId) => void;
  transition: (clipId: string, type: TransitionType) => void;
};

const SUB = 'max-h-80 w-48 overflow-y-auto';

/**
 * A clip's Animate ▸, Look ▸ and Transition ▸ submenus. Animate fits any visual clip, Look
 * any picture clip, Transition a main-track clip with one after it.
 */
export function ClipMotionMenus({
  clip,
  transitionsToNext,
  actions,
}: {
  clip: EditorClip;
  transitionsToNext: boolean;
  actions: MotionMenuActions;
}) {
  const registryText = useStudioMetadata();

  const translateUi = useUiTranslations('studio');

  if (!animates(clip)) return null;
  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Sparkles /> {translateUi('animate_fd4a5f3d')}{' '}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className={SUB}>
          {CLIP_MOTION_PRESET_IDS.map((preset) => (
            <ContextMenuItem key={preset} onClick={() => actions.animate(clip.id, preset)}>
              {registryText(CLIP_MOTION_PRESETS[preset].label)}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      {takesLook(clip) ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Palette /> {translateUi('look_a0de5719')}{' '}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={SUB}>
            {LOOK_EFFECT_IDS.map((effect) => (
              <ContextMenuItem key={effect} onClick={() => actions.look(clip.id, effect)}>
                {registryText(LOOK_EFFECTS[effect].label)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {transitionsToNext ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Blend /> {translateUi('transition_2fe70464')}{' '}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={SUB}>
            {SEAM_TRANSITIONS.map((type) => (
              <ContextMenuItem key={type} onClick={() => actions.transition(clip.id, type)}>
                {registryText(TRANSITION_LABELS[type])} {translateUi('into_next_a4f503b3')}{' '}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => actions.transition(clip.id, 'cut')}>
              {' '}
              {translateUi('remove_transition_cd609bcd')}{' '}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
    </>
  );
}
