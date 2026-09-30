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
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
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
  if (!animates(clip)) return null;
  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Sparkles /> Animate
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className={SUB}>
          {CLIP_MOTION_PRESET_IDS.map((preset) => (
            <ContextMenuItem key={preset} onClick={() => actions.animate(clip.id, preset)}>
              {CLIP_MOTION_PRESETS[preset].label}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      {takesLook(clip) ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Palette /> Look
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={SUB}>
            {LOOK_EFFECT_IDS.map((effect) => (
              <ContextMenuItem key={effect} onClick={() => actions.look(clip.id, effect)}>
                {LOOK_EFFECTS[effect].label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {transitionsToNext ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Blend /> Transition
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={SUB}>
            {SEAM_TRANSITIONS.map((type) => (
              <ContextMenuItem key={type} onClick={() => actions.transition(clip.id, type)}>
                {TRANSITION_LABELS[type]} into next
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => actions.transition(clip.id, 'cut')}>
              Remove transition
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
    </>
  );
}
