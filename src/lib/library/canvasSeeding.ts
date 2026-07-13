// The revision-guarded write half of "Open in Canvas". The canvas the user is
// looking at is whatever the canvas_sessions row says, so a blind upsert built from
// a stale read would erase work they did between our read and our write. This is the
// same compare-and-set loop the Backend's canvas tools use
// (Continuum-Backend/App/ai-studio/canvas/rooms.ts): read, re-apply the (pure)
// merge, write only at the revision we read, and replay against the winner on a lost
// race.
//
// The store is a port so the loop is unit-testable without Supabase; the adapter
// lives in the route that owns the service-role client.

import {
  type CanvasTemplateGraph,
  mergeSeedIntoGraph,
  type PersistedGraph,
} from './canvasTemplates';

export type CanvasGraphSnapshot = {
  graph: PersistedGraph;
  /** null when the room has no canvas_sessions row yet. */
  revision: number | null;
};

export interface CanvasGraphStore {
  read(roomId: string): Promise<CanvasGraphSnapshot>;
  /** false when another writer inserted the row first (unique-violation race). */
  insert(roomId: string, graph: PersistedGraph): Promise<boolean>;
  /** false when the row no longer sits at expectedRevision. */
  update(roomId: string, graph: PersistedGraph, expectedRevision: number): Promise<boolean>;
}

export const MAX_SEED_ATTEMPTS = 4;

export class CanvasSeedConflictError extends Error {
  constructor() {
    super('The canvas kept changing while the Library seed was being applied.');
    this.name = 'CanvasSeedConflictError';
  }
}

export type SeedOutcome = {
  graph: PersistedGraph;
  attempts: number;
};

export async function seedCanvasGraph(
  store: CanvasGraphStore,
  roomId: string,
  seed: CanvasTemplateGraph,
  maxAttempts: number = MAX_SEED_ATTEMPTS,
): Promise<SeedOutcome> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { graph, revision } = await store.read(roomId);
    const next = mergeSeedIntoGraph(graph, seed);
    const written =
      revision === null
        ? await store.insert(roomId, next)
        : await store.update(roomId, next, revision);
    if (written) return { graph: next, attempts: attempt };
  }
  throw new CanvasSeedConflictError();
}
