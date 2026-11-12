// Pure, dependency-free helpers that describe WHY an organic control is disabled
// and what unlocks it. Kept out of the heavy component files so the copy is
// unit-testable in isolation and reused across the planner toolbar, the metrics
// dashboard, and the agent composer (BUG-013, BUG-014, IMP-013, IMP-020). Each
// helper returns null exactly when the matching control is enabled, so a caller
// can wire "show a reason iff the control is disabled" without drifting.

export type DisabledReasonKey =
  | 'disabledAddGenerating'
  | 'disabledHideGenerating'
  | 'disabledNothingToHide'
  | 'disabledRefreshConnect'
  | 'disabledLiveMetrics'
  | 'disabledRefreshing'
  | 'disabledExportConnect'
  | 'disabledExports'
  | 'disabledExporting'
  | 'disabledWaitAnalytics'
  | 'disabledAgentResponding'
  | 'disabledWorkspaceLoading';
export type DisabledReasonTranslator = (
  key: DisabledReasonKey,
  values?: { platform: string },
) => string;

export type DisabledHint = {
  reason: string;
  unlocks?: string;
};

export function describeAddPlaceholderBlock(
  input: { isGenerating: boolean },
  translate?: DisabledReasonTranslator,
): DisabledHint | null {
  if (input.isGenerating) {
    return {
      reason:
        translate?.('disabledAddGenerating') ??
        'Generation is running. Adding placeholders is paused until it finishes.',
    };
  }
  return null;
}

// "Clear view" hides posts from the planner's views; it deletes nothing. The copy has to
// say so, or a disabled tooltip re-introduces the fear the control itself just shed.
export function describeClearBlock(
  input: {
    isGenerating: boolean;
    draftsCount: number;
  },
  translate?: DisabledReasonTranslator,
): DisabledHint | null {
  if (input.isGenerating) {
    return {
      reason:
        translate?.('disabledHideGenerating') ??
        'Generation is running. Hiding posts is paused until it finishes.',
    };
  }
  if (input.draftsCount === 0) {
    return {
      reason:
        translate?.('disabledNothingToHide') ?? 'There are no posts in this view to hide yet.',
    };
  }
  return null;
}

export function describeRefreshBlock(
  input: {
    hasAccount: boolean;
    isLoading: boolean;
    platformLabel: string;
  },
  translate?: DisabledReasonTranslator,
): DisabledHint | null {
  if (!input.hasAccount) {
    return {
      reason:
        translate?.('disabledRefreshConnect', {
          platform: input.platformLabel,
        }) ?? `Connect and select a ${input.platformLabel} account to refresh analytics.`,
      unlocks: translate?.('disabledLiveMetrics') ?? 'live account and post metrics',
    };
  }
  if (input.isLoading) {
    return {
      reason: translate?.('disabledRefreshing') ?? 'Analytics are already refreshing.',
    };
  }
  return null;
}

export function describeExportBlock(
  input: {
    hasAccount: boolean;
    isLoading: boolean;
    isExporting: boolean;
    platformLabel: string;
  },
  translate?: DisabledReasonTranslator,
): DisabledHint | null {
  if (!input.hasAccount) {
    return {
      reason:
        translate?.('disabledExportConnect', {
          platform: input.platformLabel,
        }) ?? `Connect and select a ${input.platformLabel} account to export or email a report.`,
      unlocks: translate?.('disabledExports') ?? 'CSV, HTML, and Continuum Report email',
    };
  }
  if (input.isExporting) {
    return {
      reason: translate?.('disabledExporting') ?? 'A report is already being prepared.',
    };
  }
  if (input.isLoading) {
    return {
      reason:
        translate?.('disabledWaitAnalytics') ??
        'Wait for analytics to finish loading before exporting or emailing.',
    };
  }
  return null;
}

export function describeComposerBlock(
  input: {
    isStreaming: boolean;
    hasSession: boolean;
  },
  translate?: DisabledReasonTranslator,
): DisabledHint | null {
  if (input.isStreaming) {
    return {
      reason:
        translate?.('disabledAgentResponding') ??
        "The agent is responding. It'll be ready for your next message in a moment.",
    };
  }
  if (!input.hasSession) {
    return {
      reason:
        translate?.('disabledWorkspaceLoading') ??
        'Getting your workspace ready. Starters unlock in a moment.',
    };
  }
  return null;
}
