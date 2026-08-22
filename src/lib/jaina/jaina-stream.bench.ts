/**
 * Measures what the Jaina chat surface pays to interpret one streamed report turn.
 *
 * The surface freezes while a report streams because `reduceJainaStreamEvent` re-parses the
 * WHOLE accumulated report string on every token delta. This bench replays a report through the
 * real parse+reduce path and reports the cost, so the coalescing window is chosen from a number
 * rather than a hunch.
 *
 * Fixture provenance: the report body is the real captured Jaina report in `test-stream.ts`
 * (real campaign names and spend), grown to the row/section counts a full account produces. It is
 * a shaped fixture, not a byte-captured transcript — the un-exercised hop is the wire itself,
 * which cannot change the reducer cost this measures (a function of accumulated length and delta
 * count only).
 */

import {
  coalesceJainaStreamEvents,
  createInitialJainaStreamState,
  type ParsedJainaStreamEvent,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from './stream';

const SECTIONS = 6;
/** Word-sized, matching how the model emits output_json deltas. */
const DELTA_CHARS = 6;

function buildReport(campaignRows: number): unknown {
  const campaignTable = Array.from({ length: campaignRows }, (_, index) => ({
    campaign_name: `ANDROID | FEED - App AdvantagePlus - ${index % 3 === 0 ? 'Influencer' : index % 3 === 1 ? 'UDF' : '2024'} ${index}`,
    status: index % 7 === 0 ? 'PAUSED' : 'ACTIVE',
    spend: 41551.73 + index * 137.11,
    purchases: 56 + index,
    cpa: 741.99 + index * 3.5,
    roas: 1.66 + (index % 5) * 0.11,
    revenue: 69017.95 + index * 421.7,
  }));

  return {
    executive_summary:
      'Your top-performing campaigns across the last 7 days are driven by the Advantage+ App suite. ' +
      'Spend concentrated in three campaign families, with the Influencer family carrying the best ' +
      'balance of scale and efficiency while UDF returns the highest ROAS per dollar.',
    main_performance_snapshot: [
      { metric: 'Total Spend', value: 102985.51, change: 12.4, is_positive: true },
      { metric: 'Total Revenue', value: 175126.11, change: 18.2, is_positive: true },
      { metric: 'Avg. ROAS', value: 1.7, change: 4.1, is_positive: true },
      { metric: 'Avg. CPA', value: 817.35, change: -6.3, is_positive: false },
    ],
    primary_performance_graph: {
      title: 'Campaign Efficiency Comparison (CPA vs ROAS)',
      type: 'bar',
      x_axis_label: 'Campaign',
      y_axis_label: 'Metric Value',
      series: [
        {
          name: 'ROAS',
          data: campaignTable.slice(0, 12).map((row) => ({
            category: row.campaign_name,
            value: row.roas,
          })),
        },
        {
          name: 'CPA (Indexed / 100)',
          data: campaignTable.slice(0, 12).map((row) => ({
            category: row.campaign_name,
            value: row.cpa / 100,
          })),
        },
      ],
    },
    campaign_table: campaignTable,
    strategic_analysis: Array.from({ length: SECTIONS }, (_, index) => ({
      title: `Efficiency Leader: App AdvantagePlus segment ${index}`,
      description:
        'This campaign is your best when considering a balance of scale and cost. It sustains ' +
        'delivery without the CPA drift seen elsewhere in the account, and its audience overlap ' +
        'with the volume driver is low enough that scaling it should not cannibalise.',
    })),
    next_steps: Array.from({ length: SECTIONS }, (_, index) => ({
      action: `Scale segment ${index}`,
      impact: 'High Impact on ROAS',
      recommendation:
        'Increase daily budget by 15-20% and hold creative constant for one full learning window ' +
        'so the change in CPA is attributable to budget rather than creative rotation.',
    })),
  };
}

function toDeltaLines(reportJson: string): string[] {
  const lines: string[] = [];
  for (let offset = 0; offset < reportJson.length; offset += DELTA_CHARS) {
    lines.push(
      JSON.stringify({
        type: 'response.output_json.delta',
        data: {
          item_id: 'item_bench',
          part_id: 'part_bench',
          delta: reportJson.slice(offset, offset + DELTA_CHARS),
        },
        eventId: `evt_${lines.length}`,
        seq: lines.length,
        ts: new Date(0).toISOString(),
      }),
    );
  }
  return lines;
}

function replay(lines: string[]): { ms: number; reduced: number } {
  let state = createInitialJainaStreamState();
  const startedAt = performance.now();
  let reduced = 0;
  for (const line of lines) {
    const event = parseJainaStreamEvent(line);
    if (!event) continue;
    state = reduceJainaStreamEvent(state, event);
    reduced += 1;
  }
  const ms = performance.now() - startedAt;
  if (!state.report) throw new Error('bench replayed a report but the reducer produced none');
  return { ms, reduced };
}

/**
 * Replays through the SHIPPED reader path: buffer a coalescing window's worth of lines, run the
 * real `coalesceJainaStreamEvents` over the batch, then fold it. `perBatch` stands in for how many
 * frames land inside one `JAINA_DELTA_COALESCE_MS` window.
 */
function replayCoalesced(lines: string[], perBatch: number): { ms: number; reduced: number } {
  let state = createInitialJainaStreamState();
  let reduced = 0;
  const startedAt = performance.now();
  for (let index = 0; index < lines.length; index += perBatch) {
    const batch: ParsedJainaStreamEvent[] = [];
    for (const line of lines.slice(index, index + perBatch)) {
      const event = parseJainaStreamEvent(line);
      if (event) batch.push(event);
    }
    for (const event of coalesceJainaStreamEvents(batch)) {
      state = reduceJainaStreamEvent(state, event);
      reduced += 1;
    }
  }
  const ms = performance.now() - startedAt;
  if (!state.report) throw new Error('bench coalesced a report but the reducer produced none');
  return { ms, reduced };
}

function main(): void {
  console.log('Jaina stream reducer bench');

  // Sweeping report size shows the cost is superlinear: the reducer re-parses the WHOLE
  // accumulated string on every delta, so doubling the report roughly quadruples the block.
  for (const campaignRows of [10, 20, 40, 80]) {
    const reportJson = JSON.stringify(buildReport(campaignRows));
    const lines = toDeltaLines(reportJson);
    const baseline = replay(lines);

    console.log(
      `\n  ${(reportJson.length / 1024).toFixed(1)} KB report, ${lines.length} deltas on wire`,
    );
    console.log(
      `    per-delta reduce  ${baseline.ms.toFixed(0).padStart(5)} ms over ${baseline.reduced} reduces`,
    );

    // What the same turn costs once consecutive deltas are merged before reducing. `perBatch`
    // stands in for a coalescing window: at ~40 deltas/sec, 8 deltas is roughly 200ms of wire.
    for (const perBatch of [4, 8, 16, 32]) {
      const { ms, reduced } = replayCoalesced(lines, perBatch);
      console.log(
        `    batch of ${String(perBatch).padStart(2)}      ${ms.toFixed(0).padStart(5)} ms over ${String(reduced).padStart(4)} reduces  (${(baseline.ms / ms).toFixed(1)}x)`,
      );
    }
  }
}

main();
