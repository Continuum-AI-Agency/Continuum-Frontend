// Coerce a checkpoint-report payload into something renderable.
//
// This is shape normalisation, not transport: several hundred lines that heal drifted report
// payloads (legacy `sections`, a `report_assembly` envelope, loose KPI records, blocks-only
// reports missing their derived legacy fields) into `FrontendCheckpointReport`. It lived inside
// the 4,122-line NDJSON reducer only because the reducer was the first caller; it is not reducer
// logic and it outlived the reducer.
//
// Two callers, and they MUST agree: `uiMessageProjection.ts` (a report that just streamed in) and
// `persistedReport.ts` (the same report reloaded from Postgres). A report has to render the same
// either way, which is why there is one copy of this and not two.

import {
  type CheckpointReportV2,
  checkpointReportV2Schema,
  deriveLegacyFieldsFromBlocks,
  type FrontendCheckpointReport,
  frontendCheckpointReportSchema,
  type HandoffTraceEntry,
  type JainaObjectiveStatus,
  type ReportAssembly,
  reportAssemblySchema,
  reportPayloadSchema,
} from './schemas';
import { unwrapReportEnvelope } from './unwrapping';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeObjectiveStatus(value: unknown): JainaObjectiveStatus {
  const raw = getNonEmptyString(value)?.toLowerCase();
  if (!raw) return 'pending';
  if (['completed', 'complete', 'done', 'success', 'succeeded'].includes(raw)) {
    return 'completed';
  }
  if (['in_progress', 'in-progress', 'running', 'active', 'started'].includes(raw)) {
    return 'in_progress';
  }
  if (['blocked', 'waiting', 'waiting_for_dependency'].includes(raw)) {
    return 'blocked';
  }
  if (['deferred', 'retry_wait', 'scheduled'].includes(raw)) {
    return 'deferred';
  }
  if (['partial', 'partially_completed'].includes(raw)) {
    return 'partial';
  }
  if (['cancelled', 'canceled'].includes(raw)) {
    return 'cancelled';
  }
  if (['failed', 'error', 'errored'].includes(raw)) {
    return 'failed';
  }
  return 'pending';
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeReportAssemblyToSoT(reportAssembly: ReportAssembly): FrontendCheckpointReport {
  const snapshot = reportAssembly.metrics.map((metric) => ({
    metric: metric.label,
    value: metric.actual,
    change: metric.index_percent,
    suffix: metric.unit === '%' ? '%' : undefined,
    context: `Planned: ${metric.planned}`,
    status:
      metric.deviation_type === 'positive'
        ? 'positive'
        : metric.deviation_type === 'negative'
          ? 'risk'
          : 'neutral',
  }));

  const recommendations = reportAssembly.recommendations.map((entry) => {
    if (typeof entry === 'string') {
      return {
        title: entry,
        rationale: entry,
        expected_impact: null,
        priority: 'MEDIUM',
      };
    }

    return {
      title: entry.title,
      rationale: entry.rationale,
      expected_impact: entry.expected_impact,
      priority: entry.priority,
    };
  });

  return {
    language: 'en',
    report_title: reportAssembly.header.title,
    executive_summary: reportAssembly.summary.narrative,
    budget: null,
    performance_snapshot: snapshot,
    blocks: [],
    sections: [
      {
        heading: reportAssembly.header.title,
        scope: reportAssembly.header.period,
        summary: reportAssembly.summary.principal_deviation || '',
        highlights: reportAssembly.insights,
        tables: [],
        actions: recommendations,
        confidence: null,
        cached_sources: [],
        graphs: reportAssembly.charts,
      },
    ],
    strategic_recommendations: recommendations,
    follow_up_questions: [],
    handoff_trace: [],
    execution_objectives: [],
    cached_sources: [],
    graphs: reportAssembly.charts,
  };
}

function normalizeInsightSeverity(value: unknown): 'positive' | 'neutral' | 'watch' | 'risk' {
  const raw = getNonEmptyString(value)?.toLowerCase();
  if (!raw) return 'neutral';
  if (raw === 'positive' || raw === 'neutral' || raw === 'watch' || raw === 'risk') {
    return raw;
  }
  if (raw.includes('positive') || raw.includes('success')) return 'positive';
  if (raw.includes('warning') || raw.includes('watch')) return 'watch';
  if (raw.includes('risk') || raw.includes('negative') || raw.includes('critical')) return 'risk';
  return 'neutral';
}

function normalizeMetricStatus(value: unknown): string | undefined {
  const raw = getNonEmptyString(value)?.toLowerCase();
  if (!raw) return undefined;
  if (raw === 'success') return 'positive';
  if (raw === 'error' || raw === 'critical') return 'risk';
  return raw;
}

function normalizeRecommendation(
  value: unknown,
): FrontendCheckpointReport['strategic_recommendations'][number] | null {
  if (typeof value === 'string') {
    const title = getNonEmptyString(value);
    if (!title) return null;
    return {
      title,
      rationale: title,
      expected_impact: null,
      priority: 'MEDIUM',
    };
  }

  const record = asRecord(value);
  if (!record) return null;

  const title =
    getNonEmptyString(record.title) ??
    getNonEmptyString(record.action) ??
    getNonEmptyString(record.type) ??
    'Recommendation';
  const rationale =
    getNonEmptyString(record.rationale) ??
    getNonEmptyString(record.reasoning) ??
    getNonEmptyString(record.description) ??
    getNonEmptyString(record.summary) ??
    'No rationale provided.';
  const expectedImpactRaw =
    getNonEmptyString(record.expected_impact) ?? getNonEmptyString(record.impact);

  return {
    title,
    rationale,
    expected_impact: expectedImpactRaw ?? null,
    priority: getNonEmptyString(record.priority) ?? 'MEDIUM',
  };
}

function normalizeMetric(
  value: unknown,
): FrontendCheckpointReport['performance_snapshot'][number] | null {
  const record = asRecord(value);
  if (!record) return null;

  const metric =
    getNonEmptyString(record.metric) ??
    getNonEmptyString(record.label) ??
    getNonEmptyString(record.name) ??
    getNonEmptyString(record.title) ??
    'Metric';

  const valueRaw = record.value ?? record.actual ?? record.current;
  const normalizedMetric: FrontendCheckpointReport['performance_snapshot'][number] = {
    metric,
    value:
      typeof valueRaw === 'number' || typeof valueRaw === 'string'
        ? valueRaw
        : String(valueRaw ?? ''),
  };

  const changeRaw =
    record.change ??
    (typeof record.trend === 'number' ? record.trend : undefined) ??
    (typeof record.index_percent === 'number' ? record.index_percent : undefined);
  if (typeof changeRaw === 'number' || typeof changeRaw === 'string') {
    normalizedMetric.change = changeRaw;
  }

  const status = normalizeMetricStatus(record.status ?? record.trend ?? record.deviation_type);
  if (status) normalizedMetric.status = status;

  const direction = getNonEmptyString(record.direction);
  if (direction) normalizedMetric.direction = direction;

  const context =
    getNonEmptyString(record.context) ??
    (record.planned !== undefined ? `Planned: ${String(record.planned)}` : undefined);
  if (context) normalizedMetric.context = context;

  const subLabel = getNonEmptyString(record.sub_label);
  if (subLabel) normalizedMetric.sub_label = subLabel;

  const prefix = getNonEmptyString(record.prefix);
  if (prefix) normalizedMetric.prefix = prefix;
  else if (getNonEmptyString(record.unit) === 'currency') normalizedMetric.prefix = '$';

  const suffix = getNonEmptyString(record.suffix);
  if (suffix) normalizedMetric.suffix = suffix;
  else if (getNonEmptyString(record.unit) === '%') normalizedMetric.suffix = '%';
  else if (getNonEmptyString(record.unit) === 'x') normalizedMetric.suffix = 'x';

  const format = getNonEmptyString(record.format);
  if (format) normalizedMetric.format = format;
  else if (getNonEmptyString(record.unit) === 'currency') normalizedMetric.format = 'currency';

  return normalizedMetric;
}

function normalizeGraph(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;

  const title = getNonEmptyString(record.title) ?? getNonEmptyString(record.label);
  return title ? { ...record, title } : record;
}

const summaryFieldPriority = [
  'narrative',
  'summary',
  'text',
  'description',
  'overview',
  'title',
  'principal_deviation',
] as const;

function extractSummaryText(value: unknown): string | undefined {
  const summaryText = getNonEmptyString(value);
  if (summaryText) return summaryText;

  const record = asRecord(value);
  if (!record) return undefined;

  for (const field of summaryFieldPriority) {
    const candidate = getNonEmptyString(record[field]);
    if (candidate) return candidate;
  }

  return undefined;
}

function normalizeTable(
  value: unknown,
): FrontendCheckpointReport['sections'][number]['tables'][number] | null {
  const record = asRecord(value);
  if (!record) return null;

  const rowsRaw = asArray(record.rows);
  const headerSource =
    Array.isArray(record.headers) && record.headers.length > 0
      ? record.headers
      : Array.isArray(record.columns) && record.columns.length > 0
        ? record.columns
        : [];
  const hasHeaders = headerSource.length > 0;
  const headers = hasHeaders ? (headerSource as unknown[]).map((header) => String(header)) : [];

  const normalizedRows: Array<unknown[] | Record<string, unknown>> = rowsRaw
    .map((row) => {
      if (Array.isArray(row)) return row;
      const objectRow = asRecord(row);
      return objectRow ?? [row];
    })
    .filter((row) => row.length !== 0);

  if (headers.length === 0 && normalizedRows.length > 0) {
    const firstRow = normalizedRows[0];
    if (Array.isArray(firstRow)) {
      headers.push(...Array.from({ length: firstRow.length }, (_, index) => `Column ${index + 1}`));
    } else {
      headers.push(...Object.keys(firstRow));
    }
  }

  if (headers.length === 0 && normalizedRows.length === 0) {
    const title = getNonEmptyString(record.title);
    if (!title) return null;
    return {
      title,
      subtitle: getNonEmptyString(record.subtitle) ?? null,
      rows: [],
      notes: getNonEmptyString(record.notes) ?? null,
    };
  }

  return {
    title: getNonEmptyString(record.title),
    subtitle: getNonEmptyString(record.subtitle) ?? null,
    headers,
    rows: normalizedRows,
    notes: getNonEmptyString(record.notes) ?? null,
  };
}

function normalizeHighlight(
  value: unknown,
): FrontendCheckpointReport['sections'][number]['highlights'][number] | null {
  const textHighlight = getNonEmptyString(value);
  if (textHighlight) {
    return {
      category: 'analysis',
      text: textHighlight,
      impact: null,
      severity: 'neutral',
      confidence: null,
      evidence: [],
    };
  }

  const record = asRecord(value);
  if (!record) return null;

  const text =
    getNonEmptyString(record.text) ??
    getNonEmptyString(record.description) ??
    getNonEmptyString(record.content);
  if (!text) return null;

  const title = getNonEmptyString(record.title) ?? getNonEmptyString(record.category);
  const impact = getNonEmptyString(record.impact) ?? getNonEmptyString(record.metric);
  const confidence = getNonEmptyString(record.confidence);
  const evidence = asArray(record.evidence)
    .map((item) => getNonEmptyString(item))
    .filter((item): item is string => Boolean(item));

  return {
    category: getNonEmptyString(record.category) ?? 'general',
    ...(title ? { title } : {}),
    text,
    impact: impact ?? null,
    severity: normalizeInsightSeverity(record.severity ?? record.impact),
    confidence: confidence ?? null,
    evidence,
  };
}

function normalizeSection(value: unknown): FrontendCheckpointReport['sections'][number] | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    heading: getNonEmptyString(record.heading) ?? getNonEmptyString(record.title) ?? 'Analysis',
    scope: getNonEmptyString(record.scope) ?? 'account',
    summary:
      extractSummaryText(record.summary) ??
      getNonEmptyString(record.content) ??
      getNonEmptyString(record.section_summary) ??
      getNonEmptyString(record.analysis_summary) ??
      '',
    highlights: asArray(record.highlights ?? record.insights ?? record.key_insights)
      .concat(asArray(record.key_findings))
      .map((item) => normalizeHighlight(item))
      .filter((item): item is FrontendCheckpointReport['sections'][number]['highlights'][number] =>
        Boolean(item),
      ),
    tables: asArray(record.tables ?? (record.table ? [record.table] : []))
      .map((item) => normalizeTable(item))
      .filter((item): item is FrontendCheckpointReport['sections'][number]['tables'][number] =>
        Boolean(item),
      ),
    actions: asArray(record.actions ?? record.recommendations ?? record.reccomendations)
      .map((item) => normalizeRecommendation(item))
      .filter((item): item is FrontendCheckpointReport['sections'][number]['actions'][number] =>
        Boolean(item),
      ),
    confidence: getNonEmptyString(record.confidence) ?? null,
    cached_sources: asArray(record.cached_sources)
      .map((item) => getNonEmptyString(item))
      .filter((item): item is string => Boolean(item)),
    graphs: asArray(record.graphs)
      .map((item) => normalizeGraph(item))
      .filter((item): item is Record<string, unknown> => Boolean(item)),
  };
}

function normalizeHandoffTraceEntry(value: unknown): HandoffTraceEntry | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    correlation_id: getNonEmptyString(record.correlation_id) ?? '',
    parent_correlation_id: getNonEmptyString(record.parent_correlation_id) ?? null,
    from_scope: getNonEmptyString(record.from_scope) ?? null,
    to_scope: getNonEmptyString(record.to_scope) ?? 'unknown',
    objective: getNonEmptyString(record.objective) ?? null,
    entity_id: getNonEmptyString(record.entity_id) ?? null,
    status: (getNonEmptyString(record.status) as 'started' | 'completed' | 'failed') ?? 'started',
    started_at: getNonEmptyString(record.started_at) ?? new Date().toISOString(),
    finished_at: getNonEmptyString(record.finished_at) ?? null,
    duration_ms: typeof record.duration_ms === 'number' ? record.duration_ms : null,
    error: getNonEmptyString(record.error) ?? null,
  };
}

function hasStructuredReportContent(report: FrontendCheckpointReport): boolean {
  return Boolean(
    report.executive_summary ||
      report.performance_snapshot.length ||
      report.blocks.length ||
      report.strategic_recommendations.length ||
      report.graphs.length ||
      report.sections.some(
        (section) =>
          Boolean(section.summary) ||
          section.highlights.length > 0 ||
          section.actions.length > 0 ||
          section.tables.length > 0 ||
          section.graphs.length > 0,
      ),
  );
}

function mergeBlockDerivedCompatibility(
  report: FrontendCheckpointReport,
): FrontendCheckpointReport {
  if (!Array.isArray(report.blocks) || report.blocks.length === 0) {
    return report;
  }

  const derived = deriveLegacyFieldsFromBlocks(report.blocks);

  return {
    ...report,
    performance_snapshot:
      report.performance_snapshot.length > 0
        ? report.performance_snapshot
        : derived.performance_snapshot,
    sections: report.sections.length > 0 ? report.sections : derived.sections,
    strategic_recommendations:
      report.strategic_recommendations.length > 0
        ? report.strategic_recommendations
        : derived.strategic_recommendations,
    follow_up_questions:
      report.follow_up_questions.length > 0
        ? report.follow_up_questions
        : derived.follow_up_questions,
    graphs: report.graphs.length > 0 ? report.graphs : derived.graphs,
    cached_sources: Array.from(new Set([...report.cached_sources, ...derived.cached_sources])),
  };
}

export function normalizeCheckpointReportPayload(value: unknown): FrontendCheckpointReport | null {
  const unwrappedValue = unwrapReportEnvelope(value);

  const strict = frontendCheckpointReportSchema.safeParse(unwrappedValue);
  if (strict.success) {
    const mergedStrict = mergeBlockDerivedCompatibility(strict.data);
    if (hasStructuredReportContent(mergedStrict)) return mergedStrict;
  }
  const reportAssembly = reportAssemblySchema.safeParse(unwrappedValue);
  if (reportAssembly.success) {
    return normalizeReportAssemblyToSoT(reportAssembly.data);
  }

  const payloadRecord = asRecord(unwrappedValue);
  if (!payloadRecord) return null;
  const summaryRecord = asRecord(payloadRecord.summary);
  const headerRecord = asRecord(payloadRecord.header);

  const normalizedSections = asArray(payloadRecord.sections)
    .map((item) => normalizeSection(item))
    .filter((item): item is FrontendCheckpointReport['sections'][number] => Boolean(item));
  const normalizedTopLevelHighlights = asArray(
    payloadRecord.key_insights ??
      payloadRecord.strategic_analysis ??
      payloadRecord.strategy_and_insights ??
      payloadRecord.insights ??
      payloadRecord.key_findings ??
      summaryRecord?.key_findings,
  )
    .map((item) => normalizeHighlight(item))
    .filter((item): item is FrontendCheckpointReport['sections'][number]['highlights'][number] =>
      Boolean(item),
    );

  if (normalizedSections.length > 0 && normalizedTopLevelHighlights.length > 0) {
    normalizedSections[0] = {
      ...normalizedSections[0],
      highlights: [...normalizedTopLevelHighlights, ...normalizedSections[0].highlights],
    };
  }

  const normalizedRecommendations = asArray(
    payloadRecord.strategic_recommendations ??
      payloadRecord.actions ??
      payloadRecord.action_plan ??
      payloadRecord.next_steps ??
      payloadRecord.recommendations ??
      payloadRecord.reccomendations ??
      payloadRecord.priority_recommendations ??
      payloadRecord.priority_reccomendations ??
      payloadRecord['priority reccomendations'] ??
      summaryRecord?.recommendations,
  )
    .map((item) => normalizeRecommendation(item))
    .filter((item): item is FrontendCheckpointReport['strategic_recommendations'][number] =>
      Boolean(item),
    );

  const sectionActions = normalizedSections.flatMap((section) => section.actions);
  const strategicRecommendations =
    normalizedRecommendations.length > 0 ? normalizedRecommendations : sectionActions;

  const normalizedPerformanceSnapshot = asArray(
    payloadRecord.performance_snapshot ?? payloadRecord.key_metrics ?? payloadRecord.metrics,
  )
    .map((item) => normalizeMetric(item))
    .filter((item): item is FrontendCheckpointReport['performance_snapshot'][number] =>
      Boolean(item),
    );

  const normalizedKpis = asArray(payloadRecord.kpis)
    .map((item) => {
      const kpi = asRecord(item);
      if (!kpi) return null;
      return normalizeMetric({
        metric:
          getNonEmptyString(kpi.name) ??
          getNonEmptyString(kpi.metric) ??
          getNonEmptyString(kpi.label) ??
          'KPI',
        value: kpi.value,
        status: kpi.status,
        unit: kpi.unit,
        context: kpi.description,
      });
    })
    .filter((item): item is FrontendCheckpointReport['performance_snapshot'][number] =>
      Boolean(item),
    );

  const budgetRecord = asRecord(payloadRecord.budget);
  const budgetMetric =
    budgetRecord &&
    (typeof budgetRecord.total_spend === 'number' || typeof budgetRecord.total_spend === 'string')
      ? normalizeMetric({
          metric: 'Total Spend',
          value: budgetRecord.total_spend,
          unit: budgetRecord.currency === 'USD' ? 'currency' : undefined,
          status: 'neutral',
        })
      : null;
  const normalizedBlocksResult = frontendCheckpointReportSchema.shape.blocks.safeParse(
    asArray(payloadRecord.blocks),
  );
  const normalizedBlocks = normalizedBlocksResult.success ? normalizedBlocksResult.data : [];

  const normalized: FrontendCheckpointReport = {
    language: getNonEmptyString(payloadRecord.language) ?? 'en',
    report_title:
      getNonEmptyString(summaryRecord?.title) ??
      getNonEmptyString(headerRecord?.title) ??
      getNonEmptyString(payloadRecord.title) ??
      '',
    executive_summary:
      getNonEmptyString(payloadRecord.executive_summary) ??
      extractSummaryText(payloadRecord.summary) ??
      getNonEmptyString(payloadRecord.title) ??
      '',
    budget: asRecord(payloadRecord.budget) ?? null,
    performance_snapshot: [
      ...normalizedPerformanceSnapshot,
      ...normalizedKpis,
      ...(budgetMetric ? [budgetMetric] : []),
    ],
    blocks: normalizedBlocks,
    sections: normalizedSections,
    strategic_recommendations: strategicRecommendations,
    follow_up_questions: asArray(payloadRecord.follow_up_questions)
      .map((item) => getNonEmptyString(item))
      .filter((item): item is string => Boolean(item)),
    handoff_trace: asArray(payloadRecord.handoff_trace)
      .map(normalizeHandoffTraceEntry)
      .filter((item): item is HandoffTraceEntry => Boolean(item)),
    execution_objectives: asArray(payloadRecord.execution_objectives)
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((objective) => ({
        id: getNonEmptyString(objective.id) ?? '',
        objective_key: getNonEmptyString(objective.objective_key) ?? null,
        title: getNonEmptyString(objective.title) ?? '',
        description: getNonEmptyString(objective.description) ?? null,
        status: normalizeObjectiveStatus(objective.status),
        scope: getNonEmptyString(objective.scope) ?? null,
        reason_code: getNonEmptyString(objective.reason_code) ?? null,
        details: getNonEmptyString(objective.details) ?? null,
        attempt_count:
          typeof objective.attempt_count === 'number' &&
          Number.isInteger(objective.attempt_count) &&
          objective.attempt_count >= 0
            ? objective.attempt_count
            : 0,
        version:
          typeof objective.version === 'number' &&
          Number.isInteger(objective.version) &&
          objective.version >= 0
            ? objective.version
            : 0,
        not_before: getNonEmptyString(objective.not_before) ?? null,
        last_attempt_at: getNonEmptyString(objective.last_attempt_at) ?? null,
        created_at: getNonEmptyString(objective.created_at) ?? new Date().toISOString(),
        updated_at: getNonEmptyString(objective.updated_at) ?? new Date().toISOString(),
      })),
    cached_sources: asArray(payloadRecord.cached_sources)
      .map((item) => getNonEmptyString(item))
      .filter((item): item is string => Boolean(item)),
    graphs: asArray(payloadRecord.graphs ?? payloadRecord.charts)
      .map((item) => normalizeGraph(item))
      .filter((item): item is Record<string, unknown> => Boolean(item)),
  };

  const normalizedResult = frontendCheckpointReportSchema.safeParse(normalized);
  if (normalizedResult.success) {
    const mergedNormalized = mergeBlockDerivedCompatibility(normalizedResult.data);
    if (hasStructuredReportContent(mergedNormalized)) {
      return mergedNormalized;
    }
  }

  const fallback = reportPayloadSchema.safeParse(unwrappedValue);
  if (!fallback.success) return null;
  if ('type' in fallback.data && fallback.data.type === 'direct_answer') return null;

  const fallbackResult = frontendCheckpointReportSchema.safeParse(fallback.data);
  if (!fallbackResult.success) return null;
  const mergedFallback = mergeBlockDerivedCompatibility(fallbackResult.data);
  return hasStructuredReportContent(mergedFallback) ? mergedFallback : null;
}

/**
 * Canonical interpretation of a checkpoint-report payload, shared by the live
 * stream reducer AND the persisted/DB loader so the two can never diverge.
 * Tier 1: strict V2 parse (the current render contract → `reportV2`). Tier 2:
 * normalize/coerce-heal into the legacy report shape (drifted blocks, legacy
 * sections → `report`). Returns whichever the payload supports, or null.
 */
export type InterpretedCheckpointReport =
  | { reportV2: CheckpointReportV2; report?: undefined }
  | { reportV2?: undefined; report: FrontendCheckpointReport };

export function interpretCheckpointReportPayload(
  rawReport: unknown,
): InterpretedCheckpointReport | null {
  const v2Parsed = checkpointReportV2Schema.safeParse(unwrapReportEnvelope(rawReport));
  if (v2Parsed.success) return { reportV2: v2Parsed.data };

  const normalized = normalizeCheckpointReportPayload(rawReport);
  if (normalized) return { report: normalized };

  return null;
}
