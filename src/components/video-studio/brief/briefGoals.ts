import type { EditorCutKind, EditorProjectV2 } from '@continuum/contracts';

export type BriefFields = { kind: EditorCutKind; targetDurationSec: number; variants: number };

export const DEFAULT_BRIEF_FIELDS: BriefFields = {
  kind: 'highlight',
  targetDurationSec: 30,
  variants: 1,
};

export const CUT_KIND_LABELS: Record<EditorCutKind, string> = {
  highlight: 'Highlight',
  hook: 'Hook',
  testimonial: 'Testimonial',
  story: 'Story',
  demo: 'Demo',
};

/** One click sets the fields a common goal needs; chips combine ("3 variants" + "30s hook"). */
export const GOAL_CHIPS: ReadonlyArray<{ label: string; patch: Partial<BriefFields> }> = [
  { label: '3 variants', patch: { variants: 3 } },
  { label: '30s hook', patch: { kind: 'hook', targetDurationSec: 30 } },
  { label: 'Testimonials', patch: { kind: 'testimonial' } },
  { label: '15s teaser', patch: { kind: 'highlight', targetDurationSec: 15 } },
];

export const chipActive = (patch: Partial<BriefFields>, fields: BriefFields): boolean =>
  (Object.keys(patch) as (keyof BriefFields)[]).every((key) => fields[key] === patch[key]);

/** The brief in words, for when nobody has typed one yet. */
export function describeBrief(fields: BriefFields): string {
  const cut = `${fields.targetDurationSec} s ${CUT_KIND_LABELS[fields.kind].toLowerCase()}`;
  return fields.variants > 1
    ? `${fields.variants} variants of a ${cut} from this footage`
    : `A ${cut} from this footage`;
}

/** Footage: a video or audio clip cut from a Library asset — what a first cut is made of. */
export const hasFootage = (project: EditorProjectV2): boolean =>
  project.tracks.some(
    (track) =>
      (track.kind === 'video' || track.kind === 'audio') &&
      track.clips.some((clip) => 'source' in clip && clip.source.sourceType === 'library_asset'),
  );

/**
 * Whether placing `asset` makes it the project's first footage — the one moment the Brief
 * offers itself. Asked of the project as it was BEFORE the placement, and only for
 * placements this page makes (a drop, a recording, a Library import): clips that arrive
 * from the agent or MCP over realtime never ask.
 */
export const placesFirstFootage = (
  project: EditorProjectV2,
  asset: { kind: 'video' | 'audio' | 'image' },
): boolean => asset.kind !== 'image' && !project.brief && !hasFootage(project);

/** Whether any clip on the timeline is cut from this Library asset. */
export const placesAsset = (project: EditorProjectV2, assetId: string): boolean =>
  project.tracks.some((track) =>
    track.clips.some(
      (clip) =>
        'source' in clip &&
        clip.source.sourceType === 'library_asset' &&
        clip.source.assetId === assetId,
    ),
  );

const offeredKey = (projectId: string) => `video-studio:brief-offered:${projectId}`;

/** Whether this browser already auto-opened the Brief for a project (dismissed stays dismissed). */
export function briefOffered(projectId: string): boolean {
  try {
    return window.localStorage.getItem(offeredKey(projectId)) !== null;
  } catch {
    return false;
  }
}

export function rememberBriefOffered(projectId: string): void {
  try {
    window.localStorage.setItem(offeredKey(projectId), '1');
  } catch {
    // Storage blocked: the Brief may offer itself again next visit — harmless.
  }
}
