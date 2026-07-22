import { type WeeklyGrid, weeklyGridSchema } from './types';

const GRID_CONTAINER_KEYS = ['grid', 'weekly_grid', 'weeklyGrid'] as const;
const ENVELOPE_KEYS = ['data', 'result', 'payload', 'response', 'body'] as const;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function collectGridCandidates(payload: unknown): unknown[] {
  const queue: unknown[] = [payload];
  const candidates: unknown[] = [];
  const seen = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    candidates.push(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    if (!isObjectRecord(current)) continue;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const key of GRID_CONTAINER_KEYS) {
      if (key in current) {
        queue.push(current[key]);
      }
    }

    for (const key of ENVELOPE_KEYS) {
      if (key in current) {
        queue.push(current[key]);
      }
    }
  }

  return candidates;
}

export function parseWeeklyGridPayload(payload: unknown): WeeklyGrid | null {
  const candidates = collectGridCandidates(payload);

  for (const candidate of candidates) {
    const parsed = weeklyGridSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }

    if (Array.isArray(candidate)) {
      const wrapped = weeklyGridSchema.safeParse({ grid: candidate });
      if (wrapped.success) {
        return wrapped.data;
      }
    }
  }

  return null;
}
