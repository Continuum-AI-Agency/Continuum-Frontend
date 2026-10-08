import {
  type ForgeCheckpoint,
  type ForgeLineageView,
  forgeCheckpointOfBytes,
  forgeCheckpointsOf,
} from '@continuum/contracts';
import { variantLabel } from './templateVersion';

/**
 * A template as a git history: CHECKPOINTS (commits) — an upload, then every change made from it —
 * with FORKS (branches, `<key>/story/base`) where a checkpoint splits off for a use case, TAGS
 * (`@published`) on the one that was published, and one LIVE checkpoint (HEAD): the bytes every
 * render uses, because the render fleet renders exactly one per template.
 *
 * The live checkpoint is found the way the render path finds it — by bytes. Renders send the
 * worker the promoted digest and the worker refuses any other file, so the checkpoint holding that
 * digest is live; this template's `@published` tag is the fallback when the digest is unknown.
 */

const KIND_BY_REASON: Record<string, string> = {
  intake: 'Upload',
  hygiene: 'Clean-up',
  geometry: 'Size',
  product: 'Asset fit',
  copy: 'Language',
  authored: 'Edit',
  autofix: 'Autofix round',
  ship: 'Delivery flip',
  dataset: 'Rows',
};

/** What a checkpoint is, in the Forge's words. */
export function checkpointKind(checkpoint: ForgeCheckpoint): string {
  if (checkpoint.tool === 'preset_family') return 'Look';
  return KIND_BY_REASON[checkpoint.reason ?? ''] ?? checkpoint.tool ?? 'Change';
}

/** A ref as a person reads it: a fork by its branch, a tag by its state. */
export function refLabel(ref: string): string {
  const at = ref.indexOf('@');
  return at === -1 ? variantLabel(ref) : ref.slice(at + 1);
}

export type CheckpointRow = ForgeCheckpoint & {
  /** How many forks deep, like the lanes of `git log --graph`. */
  depth: number;
  live: boolean;
  kind: string;
  /** The fork's branch name, when this checkpoint is a named fork. */
  branch: string | null;
};

export type CheckpointGraph = {
  rows: CheckpointRow[];
  live: CheckpointRow | null;
  /** The name a render can pin the live checkpoint by, or null when nothing names it. */
  liveRef: string | null;
};

export function checkpointGraph(
  view: Pick<ForgeLineageView, 'roots' | 'log' | 'refs' | 'master'>,
): CheckpointGraph {
  const checkpoints = forgeCheckpointsOf(view);
  const live =
    forgeCheckpointOfBytes(checkpoints, view.master) ??
    checkpoints.find((checkpoint) => checkpoint.refs.some((ref) => ref.endsWith('@published'))) ??
    null;
  const known = new Set(checkpoints.map((checkpoint) => checkpoint.id));
  const children = new Map<string | null, ForgeCheckpoint[]>();
  for (const checkpoint of checkpoints) {
    const parent = checkpoint.parent && known.has(checkpoint.parent) ? checkpoint.parent : null;
    children.set(parent, [...(children.get(parent) ?? []), checkpoint]);
  }
  const rows: CheckpointRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const checkpoint of children.get(parent) ?? []) {
      if (seen.has(checkpoint.id)) continue;
      seen.add(checkpoint.id);
      const branch = checkpoint.refs.find((ref) => !ref.includes('@'));
      rows.push({
        ...checkpoint,
        depth,
        live: checkpoint.id === live?.id,
        kind: checkpointKind(checkpoint),
        branch: branch ? variantLabel(branch) : null,
      });
      walk(checkpoint.id, depth + 1);
    }
  };
  walk(null, 0);
  const liveRow = rows.find((row) => row.live) ?? null;
  const liveRef = liveRow
    ? (liveRow.refs.find((ref) => ref.endsWith('@published')) ?? liveRow.refs[0] ?? null)
    : null;
  return { rows, live: liveRow, liveRef };
}
