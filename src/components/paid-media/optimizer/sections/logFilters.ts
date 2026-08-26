// Pure readers for the optimizer SERVER LOG feed. The feed is lifecycle-only now — the
// server split actions out of it (public.optimizer_list_actions), so the client-side
// family triage that used to live here is gone with it.
//
// It had to go. `classifyEvent` bucketed whatever rows happened to load into money /
// settings / cycles and printed a count per bucket, so the "Money" chip counted the loaded
// WINDOW, not reality — and a second classifier on this side of the wire is exactly how the
// two definitions drift apart. The split is the server's now, and there is one of it.
//
// What is left is the portfolio filter (a real narrowing of what loaded, honestly labelled)
// and the readers that give each lifecycle event a shape instead of `key: value` soup.
// Kept pure (no React) so they are unit-tested directly.

/** Sentinel for the portfolio Select's "every portfolio" option — a real
 *  portfolio name can never collide with it. */
export const ALL_PORTFOLIOS = '__all__';

/** The portfolio names actually present in the loaded window — feeds the portfolio
 *  Select with zero extra reads. Sorted, de-duped, nulls dropped. */
export function distinctPortfolioNames(rows: readonly { portfolio_name: string | null }[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.portfolio_name) names.add(row.portfolio_name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Narrow a loaded feed to one portfolio. ALL_PORTFOLIOS passes everything through. */
export function filterByPortfolio<TRow extends { portfolio_name?: string | null }>(
  rows: readonly TRow[],
  portfolio: string,
): TRow[] {
  if (portfolio === ALL_PORTFOLIOS) return [...rows];
  return rows.filter((row) => row.portfolio_name === portfolio);
}

type Fields = Record<string, unknown>;

/** A finite number, tolerating the numeric-string form Postgres/JSON can produce. */
function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A non-empty text value. */
function readText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** One named number from a lifecycle event's fields — the counts a cycle reports. */
export type LifecycleFact = { label: string; value: string };

/** A lifecycle row, read into something renderable.
 *
 *  `title`   — what happened, in words rather than a snake_case event name.
 *  `summary` — the one sentence that explains it, when the event carries enough to say one.
 *  `facts`   — the counts worth showing, in a fixed order, absent ones dropped.
 *  `detail`  — a longer list (drifted ad sets, per-item failures) the row can expand into. */
export type LifecycleRow = {
  title: string;
  summary: string | null;
  facts: LifecycleFact[];
  detail: string[];
};

const SKIP_REASONS: Record<string, string> = {
  no_adsets: 'Nothing is enrolled in this portfolio yet, so there was nothing to score.',
  no_snapshots:
    'No performance snapshots had landed for this portfolio yet, so there was nothing to score.',
};

function counts(fields: Fields, spec: [string, string][]): LifecycleFact[] {
  const facts: LifecycleFact[] = [];
  for (const [key, label] of spec) {
    const value = readNumber(fields[key]);
    if (value != null) facts.push({ label, value: value.toLocaleString('en-US') });
  }
  return facts;
}

/** The drifted ad sets a roster_drift_detected row carries, as "name (id)" lines. Names,
 *  not just ids: an operator cannot act on "120251303880680236". */
function driftedAdsets(fields: Fields): string[] {
  const raw = fields.adsets;
  if (!Array.isArray(raw)) return [];
  const lines: string[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const adset = entry as { id?: unknown; name?: unknown };
    const id = readText(adset.id);
    const name = readText(adset.name);
    if (name && id) lines.push(`${name} (${id})`);
    else if (name ?? id) lines.push((name ?? id) as string);
  }
  return lines;
}

/** The per-item failures an apply_partial_failure row carries. */
function applyFailures(fields: Fields): string[] {
  const raw = fields.failures;
  if (!Array.isArray(raw)) return [];
  const lines: string[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const failure = entry as { adsetId?: unknown; adset_id?: unknown; error?: unknown };
    const id = readText(failure.adsetId) ?? readText(failure.adset_id);
    const error = readText(failure.error);
    if (id && error) lines.push(`${id}: ${error}`);
    else if (id ?? error) lines.push((id ?? error) as string);
  }
  return lines;
}

/** Turn an event name nothing here knows about into something readable, rather than
 *  printing its fields as `key: value` and calling that a log page. A new lifecycle event
 *  starts appearing the day the service first writes it (the DB feed is a denylist, not an
 *  allowlist), so this fallback is load-bearing, not decoration. */
function humanizeEvent(event: string): string {
  const spaced = event.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Read one lifecycle row into its rendered shape.
 *
 * These are the only events optimizer.logs persists (Continuum-Optimizer/src/logSink.ts
 * ACTION_EVENTS is the explicit allowlist), so there is no long tail to guess at —
 * everything else is an ops event that never reaches a brand-scoped feed.
 */
export function readLifecycleRow(row: {
  event: string;
  fields?: Record<string, unknown> | null;
}): LifecycleRow {
  const fields = row.fields ?? {};

  switch (row.event) {
    case 'cycle_complete': {
      // A cycle that ran but skipped is reported by its own `skipped` field, not by a
      // separate event — saying "Cycle complete · 0 applied" for it would be a lie of omission.
      const skipped = readText(fields.skipped);
      if (skipped) {
        return {
          title: 'Cycle skipped',
          summary: SKIP_REASONS[skipped] ?? `Skipped: ${skipped}.`,
          facts: [],
          detail: [],
        };
      }
      return {
        title: 'Cycle complete',
        summary: null,
        facts: counts(fields, [
          ['snapshotCount', 'Ad sets scored'],
          ['recommendations', 'Recommendations'],
          ['applied', 'Applied'],
          ['held', 'Held for approval'],
          ['deduped', 'Already applied'],
          ['failed', 'Failed'],
        ]),
        detail: [],
      };
    }

    case 'cycle_skipped': {
      const reason = readText(fields.reason);
      return {
        title: 'Cycle skipped',
        summary: (reason && SKIP_REASONS[reason]) ?? (reason ? `Skipped: ${reason}.` : null),
        facts: [],
        detail: [],
      };
    }

    case 'cycle_failed':
      return {
        title: 'Cycle failed',
        summary: readText(fields.error) ?? 'The cycle threw before it finished.',
        facts: [],
        detail: [],
      };

    case 'roster_drift_detected': {
      const missing = readNumber(fields.missing);
      const adsets = driftedAdsets(fields);
      return {
        title: 'Roster drift',
        summary:
          missing == null
            ? 'Enrolled ad sets no longer appear in the account’s live fleet.'
            : `${missing} enrolled ad set${missing === 1 ? '' : 's'} no longer appear${missing === 1 ? 's' : ''} in the account’s live fleet — paused, deleted, or moved to campaign budget. Only a human can release them from the roster.`,
        facts: counts(fields, [
          ['seen', 'Still present'],
          ['missing', 'Missing'],
        ]),
        detail: adsets,
      };
    }

    case 'apply_partial_failure': {
      const failures = applyFailures(fields);
      return {
        title: 'Some writes failed',
        summary: 'The cycle wrote part of what it decided; these did not land on Meta.',
        facts: counts(fields, [
          ['applied', 'Applied'],
          ['failed', 'Failed'],
        ]),
        detail: failures,
      };
    }

    case 'apply_results_persist_failed':
      return {
        title: 'Results could not be saved',
        summary:
          readText(fields.error) ??
          'The writes happened on Meta but recording them failed. The apply ledger is still authoritative.',
        facts: [],
        detail: [],
      };

    case 'ingest_malformed_snapshots_skipped': {
      const malformed = readNumber(fields.malformed);
      const total = readNumber(fields.total);
      return {
        title: 'Malformed snapshots skipped',
        summary:
          malformed != null && total != null
            ? `${malformed} of ${total} snapshot rows could not be read and were dropped before scoring.`
            : 'Some snapshot rows could not be read and were dropped before scoring.',
        facts: counts(fields, [
          ['malformed', 'Dropped'],
          ['total', 'Rows read'],
        ]),
        detail: [],
      };
    }

    default:
      return {
        title: humanizeEvent(row.event),
        summary: readText(fields.error) ?? readText(fields.reason),
        facts: [],
        detail: [],
      };
  }
}
