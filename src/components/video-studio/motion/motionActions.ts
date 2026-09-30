// The workspace's motion actions — Animate, Look, Transition and the text templates — as the
// clip menus, the ⌘K palette and the timeline call them. Every one is an editor op, the same
// the agent and MCP run.

import {
  CLIP_MOTION_PRESET_IDS,
  CLIP_MOTION_PRESETS,
  type EditorClip,
  LOOK_EFFECT_IDS,
  LOOK_EFFECTS,
  TEXT_TEMPLATE_IDS,
  TEXT_TEMPLATES,
} from '@continuum/contracts';
import type { PaletteAction } from '@/StudioCanvas/nodes/timeline/workspace/CommandPalette';
import type { RunVideoEditorOp } from '../types';
import type { MotionMenuActions } from './ClipMotionMenus';
import type { TemplatePlacement } from './TextTemplateShelf';
import { DEFAULT_TRANSITION_SEC, SEAM_TRANSITIONS, TRANSITION_LABELS } from './TransitionSeam';
import { templateLines } from './textPreview';

export const animates = (clip: EditorClip | undefined): boolean =>
  clip?.kind === 'video' || clip?.kind === 'overlay' || clip?.kind === 'text';
export const takesLook = (clip: EditorClip | undefined): boolean =>
  clip?.kind === 'video' || clip?.kind === 'overlay';

type RunQuiet = <T>(label: string, run: () => Promise<T>) => Promise<T | undefined>;

/** Animate and Look act on every clip the menu widens to; a transition on the one clicked. */
export function motionClipActions({
  targetsFor,
  clipOf,
  getPlayheadSec,
  runOp,
  runQuiet,
}: {
  targetsFor: (clipId: string) => readonly string[];
  clipOf: (clipId: string) => EditorClip | undefined;
  getPlayheadSec: () => number;
  runOp: RunVideoEditorOp;
  runQuiet: RunQuiet;
}): MotionMenuActions {
  return {
    animate: (clipId, preset) =>
      void runQuiet(CLIP_MOTION_PRESETS[preset].label, async () => {
        for (const id of targetsFor(clipId)) {
          const clip = clipOf(id);
          if (!clip || !animates(clip)) continue;
          // Emphasis lands at the playhead, held inside the clip it animates.
          const atSec = Math.min(
            clip.timelineStartSec + clip.durationSec,
            Math.max(clip.timelineStartSec, getPlayheadSec()),
          );
          await runOp('animate_clip', {
            clipId: id,
            preset,
            ...(CLIP_MOTION_PRESETS[preset].phase === 'emphasis' ? { atSec } : {}),
          });
        }
      }),
    look: (clipId, effect) =>
      void runQuiet(LOOK_EFFECTS[effect].label, async () => {
        for (const id of targetsFor(clipId)) {
          if (takesLook(clipOf(id))) await runOp('apply_effect', { clipId: id, effect });
        }
      }),
    transition: (clipId, type) =>
      void runQuiet(TRANSITION_LABELS[type], () =>
        runOp('add_transition', { fromClipId: clipId, type, durationSec: DEFAULT_TRANSITION_SEC }),
      ),
  };
}

/** ⌘K: text templates at the playhead, and motion on the one selected clip. */
export function motionPaletteGroups({
  selectedClip,
  transitionsToNext,
  actions,
  placeTemplate,
  openTextTab,
}: {
  selectedClip: EditorClip | undefined;
  transitionsToNext: boolean;
  actions: MotionMenuActions;
  placeTemplate: (placement: TemplatePlacement) => void;
  openTextTab: () => void;
}): Array<{ heading: string; actions: PaletteAction[] }> {
  const clipId = selectedClip?.id ?? '';
  return [
    {
      heading: 'Text',
      actions: [
        { id: 'text-tab', label: 'Open text templates', run: openTextTab },
        ...TEXT_TEMPLATE_IDS.map((template) => ({
          id: `text-${template}`,
          label: `Add ${TEXT_TEMPLATES[template].label} at playhead`,
          run: () =>
            placeTemplate({
              template,
              ...templateLines(template, { text: '', secondaryText: '' }),
            }),
        })),
      ],
    },
    {
      heading: 'Motion',
      actions: [
        ...CLIP_MOTION_PRESET_IDS.map((preset) => ({
          id: `animate-${preset}`,
          label: `Animate: ${CLIP_MOTION_PRESETS[preset].label}`,
          disabled: !animates(selectedClip),
          run: () => actions.animate(clipId, preset),
        })),
        ...LOOK_EFFECT_IDS.map((effect) => ({
          id: `look-${effect}`,
          label: `Look: ${LOOK_EFFECTS[effect].label}`,
          disabled: !takesLook(selectedClip),
          run: () => actions.look(clipId, effect),
        })),
        ...SEAM_TRANSITIONS.map((type) => ({
          id: `transition-${type}`,
          label: `Transition: ${TRANSITION_LABELS[type]} into next clip`,
          disabled: !transitionsToNext,
          run: () => actions.transition(clipId, type),
        })),
      ],
    },
  ];
}
