// Pure, dependency-free helpers that describe WHY an organic control is disabled
// and what unlocks it. Kept out of the heavy component files so the copy is
// unit-testable in isolation and reused across the planner toolbar, the metrics
// dashboard, and the agent composer (BUG-013, BUG-014, IMP-013, IMP-020). Each
// helper returns null exactly when the matching control is enabled, so a caller
// can wire "show a reason iff the control is disabled" without drifting.

export type DisabledHint = {
  reason: string;
  unlocks?: string;
};

export function describeAddPlaceholderBlock(input: { isGenerating: boolean }): DisabledHint | null {
  if (input.isGenerating) {
    return {
      reason: 'Generation is running. Adding placeholders is paused until it finishes.',
    };
  }
  return null;
}

export function describeGenerateBlock(input: {
  isGenerating: boolean;
  seededDraftCount: number;
}): DisabledHint | null {
  if (input.isGenerating) {
    return { reason: 'Generation is already running.' };
  }
  if (input.seededDraftCount === 0) {
    return {
      reason: 'Add at least one placeholder to the calendar first.',
      unlocks: 'AI drafts written from your Brand Book',
    };
  }
  return null;
}

export function describeClearBlock(input: {
  isGenerating: boolean;
  draftsCount: number;
}): DisabledHint | null {
  if (input.isGenerating) {
    return {
      reason: 'Generation is running. Clearing is paused until it finishes.',
    };
  }
  if (input.draftsCount === 0) {
    return { reason: 'There are no drafts on the calendar to clear yet.' };
  }
  return null;
}

export function describeRefreshBlock(input: {
  hasAccount: boolean;
  isLoading: boolean;
  platformLabel: string;
}): DisabledHint | null {
  if (!input.hasAccount) {
    return {
      reason: `Connect and select a ${input.platformLabel} account to refresh analytics.`,
      unlocks: 'live account and post metrics',
    };
  }
  if (input.isLoading) {
    return { reason: 'Analytics are already refreshing.' };
  }
  return null;
}

export function describeExportBlock(input: {
  hasAccount: boolean;
  isLoading: boolean;
  isExporting: boolean;
  platformLabel: string;
}): DisabledHint | null {
  if (!input.hasAccount) {
    return {
      reason: `Connect and select a ${input.platformLabel} account to export or email a report.`,
      unlocks: 'CSV, HTML, and Continuum Report email',
    };
  }
  if (input.isExporting) {
    return { reason: 'A report is already being prepared.' };
  }
  if (input.isLoading) {
    return { reason: 'Wait for analytics to finish loading before exporting or emailing.' };
  }
  return null;
}

export function describeComposerBlock(input: {
  isStreaming: boolean;
  hasSession: boolean;
}): DisabledHint | null {
  if (input.isStreaming) {
    return {
      reason: "The agent is responding. It'll be ready for your next message in a moment.",
    };
  }
  if (!input.hasSession) {
    return {
      reason: 'Getting your workspace ready. Starters unlock in a moment.',
    };
  }
  return null;
}
