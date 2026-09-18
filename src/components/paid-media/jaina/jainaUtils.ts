import {
  type FrontendCheckpointReport,
  frontendCheckpointReportSchema,
  hasReportContent,
  type ReportPayload,
} from '@/lib/jaina/schemas';
import { parsePersistedReportValue } from './persistedReport';
import type { JainaChatMessage } from './types';

const reportSignalKeys = [
  'render_as',
  'renderAs',
  'render_mode',
  'render_as_report',
  'renderAsReport',
  'output_format',
  'report_view',
];

const isReportSignalValue = (value: unknown) => {
  if (value === true) return true;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'report';
  }
  return false;
};

const hasReportSignal = (record: Record<string, unknown>) =>
  reportSignalKeys.some((key) => isReportSignalValue(record[key]));

/**
 * Did anything in this turn ask for its answer to be RENDERED as a report?
 *
 * The second argument used to be the raw `state.delta` array. That array does not exist on the
 * native wire and nothing else read it, so this now takes the flat part payloads that survive it
 * (the report meta and the checkpoint summary) — `uiMessageProjection.reportSignalRecordsOf` is
 * what supplies them. The `progress` fallback is unchanged and is still the path that fires for
 * every turn whose signal arrived as a progress stage.
 */
export const resolveReportSignal = (
  progress: JainaChatMessage['reasoning'] = [],
  records: ReadonlyArray<Record<string, unknown>> = [],
) => {
  for (const record of records) {
    if (hasReportSignal(record)) return true;
  }
  for (const entry of progress) {
    const data = (entry?.data ?? {}) as Record<string, unknown>;
    if (hasReportSignal(data)) return true;
  }
  return false;
};

export const getFinalThought = (progress: JainaChatMessage['reasoning'] = []) => {
  for (let i = progress.length - 1; i >= 0; i -= 1) {
    const entry = progress[i];
    if (entry?.stage === 'thinking' && typeof entry.detail === 'string') {
      const trimmed = entry.detail.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
};

/**
 * The report's own one-line summary, healed when synthesis declined to write one.
 *
 * "Synthesis summary unavailable" is a placeholder the Backend emits, and printing it is worse
 * than printing the first thing the report actually says.
 */
export function resolveReportSummaryForMessage(
  report: JainaChatMessage['report'] | undefined,
): string {
  if (!report) return '';
  const summary = getReportSummary(report).trim();
  const isUnavailableSummary = /synthesis summary unavailable/i.test(summary);
  if (!isUnavailableSummary) return summary;
  if ('type' in report) return summary;

  const v1 = frontendCheckpointReportSchema.safeParse(report);
  if (!v1.success) return summary;

  const firstSectionSummary = v1.data.sections.find((section) =>
    Boolean(section.summary?.trim()),
  )?.summary;
  if (firstSectionSummary) return firstSectionSummary;

  const firstRecommendation = v1.data.strategic_recommendations[0];
  if (firstRecommendation?.title) {
    return firstRecommendation.rationale
      ? `${firstRecommendation.title}: ${firstRecommendation.rationale}`
      : firstRecommendation.title;
  }

  return summary;
}

export type RenderableContentSources = {
  sessionTitle?: string;
  pendingClarification?: { question: string } | null;
  responseText: string;
  report?: JainaChatMessage['report'] | null;
  reportV2?: JainaChatMessage['reportV2'] | null;
  latestCheckpointSummary?: string;
  checkpointSummarySource?: 'synthesis' | 'tool_fallback' | 'default_unavailable' | null;
  plan?: JainaChatMessage['plan'] | null;
  progress: JainaChatMessage['reasoning'];
};

/**
 * The prose a turn shows, in the order a reader wants it.
 *
 * A turn that answered with a report has little or no plain text, so `message.content` cannot be
 * the concatenated text parts alone — that renders as an empty bubble under a report card. This
 * ladder is what fills it, and it is a pure function of one message's own fields.
 */
export function pickRenderableContent(sources: RenderableContentSources): string {
  const clarification = sources.pendingClarification?.question?.trim();
  if (clarification) return clarification;

  const safeText = isLikelyStructuredJsonContent(sources.responseText)
    ? (extractRenderableFallbackFromStructuredContent(sources.responseText) ?? '').trim()
    : sources.responseText.trim();
  if (safeText) return safeText;

  const v2Summary = sources.reportV2?.executive_summary?.trim();
  if (v2Summary) return v2Summary;

  const reportSummary = resolveReportSummaryForMessage(sources.report ?? undefined).trim();
  if (reportSummary) return reportSummary;

  const checkpointSummary =
    sources.checkpointSummarySource !== 'default_unavailable'
      ? (sources.latestCheckpointSummary ?? '').trim()
      : '';
  if (checkpointSummary) return checkpointSummary;

  const planTitle = sources.plan?.title?.trim();
  if (planTitle) return planTitle;

  const finalThought = getFinalThought(sources.progress)?.trim();
  if (finalThought) return finalThought;

  const sessionTitle = sources.sessionTitle?.trim();
  if (sessionTitle) return sessionTitle;

  return '';
}

export const getReportSummary = (report: ReportPayload | null) => {
  if (!report) return '';
  if ('type' in report && report.type === 'direct_answer') {
    return report.content;
  }
  const r = report as FrontendCheckpointReport;
  return r.executive_summary || '';
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function collectBalancedJsonObjectCandidates(value: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function parseJsonCandidate(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractJsonObjectCandidates(value: string): unknown[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const rawCandidates = [trimmed];
  const firstBraceIndex = trimmed.indexOf('{');
  const lastBraceIndex = trimmed.lastIndexOf('}');
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    const sliced = trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
    if (sliced !== trimmed) rawCandidates.push(sliced);
  }
  rawCandidates.push(...collectBalancedJsonObjectCandidates(trimmed));
  return rawCandidates
    .map((candidate) => parseJsonCandidate(candidate))
    .filter((candidate) => candidate != null);
}

function extractHighlightText(value: unknown): string | null {
  const direct = toNonEmptyString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return null;
  return (
    toNonEmptyString(record.text) ??
    toNonEmptyString(record.title) ??
    toNonEmptyString(record.summary)
  );
}

function extractRecommendationText(value: unknown): string | null {
  const direct = toNonEmptyString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return null;
  const title = toNonEmptyString(record.title) ?? toNonEmptyString(record.action);
  const rationale =
    toNonEmptyString(record.rationale) ??
    toNonEmptyString(record.description) ??
    toNonEmptyString(record.summary);
  if (title && rationale) return `${title}: ${rationale}`;
  return title ?? rationale;
}

function extractMetricText(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return toNonEmptyString(value);
  const label =
    toNonEmptyString(record.metric) ??
    toNonEmptyString(record.label) ??
    toNonEmptyString(record.name) ??
    toNonEmptyString(record.title);
  const metricValue =
    toNonEmptyString(record.value) ??
    toNonEmptyString(record.actual) ??
    toNonEmptyString(record.current);
  if (label && metricValue) return `${label}: ${metricValue}`;
  return label ?? metricValue;
}

function pushUniqueLine(lines: string[], line: string): void {
  const normalized = line.trim();
  if (!normalized) return;
  if (!lines.includes(normalized)) lines.push(normalized);
}

function extractRenderableLinesFromRecord(record: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const title =
    toNonEmptyString(record.report_title) ??
    toNonEmptyString(record.title) ??
    (() => {
      const summaryRecord = asRecord(record.summary);
      return summaryRecord ? toNonEmptyString(summaryRecord.title) : null;
    })();
  if (title) pushUniqueLine(lines, `### ${title}`);

  const summary =
    toNonEmptyString(record.executive_summary) ??
    toNonEmptyString(record.summary) ??
    toNonEmptyString(record.narrative) ??
    toNonEmptyString(record.message) ??
    toNonEmptyString(record.content) ??
    (() => {
      const summaryRecord = asRecord(record.summary);
      return summaryRecord
        ? (toNonEmptyString(summaryRecord.narrative) ??
            toNonEmptyString(summaryRecord.overview) ??
            toNonEmptyString(summaryRecord.summary))
        : null;
    })();
  if (summary) pushUniqueLine(lines, summary);

  const metricCandidates = [
    ...(Array.isArray(record.performance_snapshot) ? record.performance_snapshot : []),
    ...(Array.isArray(record.metrics) ? record.metrics : []),
    ...(Array.isArray(record.kpis) ? record.kpis : []),
  ]
    .map(extractMetricText)
    .filter((candidate): candidate is string => Boolean(candidate))
    .slice(0, 4);
  if (metricCandidates.length > 0) {
    pushUniqueLine(lines, '**Performance snapshot**');
    for (const metric of metricCandidates) {
      pushUniqueLine(lines, `- ${metric}`);
    }
  }

  const sections = Array.isArray(record.sections) ? record.sections : [];
  for (const sectionValue of sections.slice(0, 3)) {
    const sectionRecord = asRecord(sectionValue);
    if (!sectionRecord) continue;
    const heading =
      toNonEmptyString(sectionRecord.heading) ?? toNonEmptyString(sectionRecord.title) ?? 'Section';
    const sectionSummary =
      toNonEmptyString(sectionRecord.summary) ??
      toNonEmptyString(sectionRecord.content) ??
      toNonEmptyString(sectionRecord.description);
    pushUniqueLine(lines, `**${heading}**`);
    if (sectionSummary) pushUniqueLine(lines, sectionSummary);

    const highlights = Array.isArray(sectionRecord.highlights) ? sectionRecord.highlights : [];
    for (const highlight of highlights.slice(0, 2)) {
      const text = extractHighlightText(highlight);
      if (text) pushUniqueLine(lines, `- ${text}`);
    }
  }

  const recommendationCandidates = [
    ...(Array.isArray(record.strategic_recommendations) ? record.strategic_recommendations : []),
    ...(Array.isArray(record.recommendations) ? record.recommendations : []),
    ...(Array.isArray(record.actions) ? record.actions : []),
  ]
    .map(extractRecommendationText)
    .filter((candidate): candidate is string => Boolean(candidate))
    .slice(0, 4);
  if (recommendationCandidates.length > 0) {
    pushUniqueLine(lines, '**Recommended actions**');
    for (const recommendation of recommendationCandidates) {
      pushUniqueLine(lines, `- ${recommendation}`);
    }
  }

  const followUpQuestions = (
    Array.isArray(record.follow_up_questions) ? record.follow_up_questions : []
  )
    .map((candidate) => toNonEmptyString(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
    .slice(0, 3);
  if (followUpQuestions.length > 0) {
    pushUniqueLine(lines, '**Follow-up questions**');
    for (const question of followUpQuestions) {
      pushUniqueLine(lines, `- ${question}`);
    }
  }

  return lines;
}

export function extractRenderableFallbackFromReport(
  report: ReportPayload | null | undefined,
): string | null {
  if (!report) return null;
  if ('type' in report && report.type === 'direct_answer') {
    return toNonEmptyString(report.content);
  }
  const lines = extractRenderableLinesFromRecord(report as unknown as Record<string, unknown>);
  return lines.length > 0 ? lines.join('\n') : null;
}

export function isLikelyStructuredJsonContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return true;
  }
  return (
    trimmed.includes('"executive_summary"') ||
    trimmed.includes('"performance_snapshot"') ||
    trimmed.includes('"sections"') ||
    trimmed.includes('"strategic_recommendations"') ||
    trimmed.includes('"checkpoint_report"')
  );
}

export function extractRenderableFallbackFromStructuredContent(content: string): string | null {
  const parsedReport = parsePersistedReportValue({
    report: undefined,
    content,
  });
  const reportFallback = extractRenderableFallbackFromReport(parsedReport);
  if (reportFallback) return reportFallback;

  const candidates = extractJsonObjectCandidates(content);
  let bestFallback: string | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) continue;
    const lines = extractRenderableLinesFromRecord(record);
    if (lines.length === 0) continue;
    const fallback = lines.join('\n');
    const score = fallback.length;
    if (score > bestScore) {
      bestFallback = fallback;
      bestScore = score;
    }
  }

  return bestFallback;
}

export const formatStageLabel = (stage: string) => {
  if (stage === 'router' || stage === 'routing') {
    return 'Consulting the Council';
  }
  if (stage === 'thinking') {
    return 'Thinking';
  }
  return stage.replace(/_/g, ' ');
};

export const formatToolLabel = (toolName: string) =>
  toolName === 'router' ? 'Consulting the Council' : toolName.replace(/_/g, ' ');

export function isStreamingPlaceholderMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === 'thinking through your request…' ||
    normalized === 'processing your clarification…' ||
    normalized === 'building checkpoint report…' ||
    normalized === 'generating analysis...' ||
    normalized === 'working through objectives…'
  );
}

export function normalizeJainaMarkdownTables(content: string): string {
  // Backend sends table rows separated by "; " instead of newlines.
  // Replace "; |" with "\n|" to produce valid GFM table rows.
  let out = content.replace(/;\s+(?=\|)/g, '\n');

  // Table headers sometimes appear inline with preceding prose, e.g.:
  // "• Recommendations: | Header | ROAS |"
  // GFM tables require the header row on its own line, so split it out.
  out = out
    .split('\n')
    .map((line) => {
      const m = line.match(/^([^|]+)(\|.+\|)\s*$/);
      return m ? `${m[1].trimEnd()}\n\n${m[2]}` : line;
    })
    .join('\n');

  return out;
}

export { hasReportContent };
