'use client';

import { useTranslations } from 'next-intl';
import { automationReadinessMessage } from '@/i18n/automationReadiness';

// The confirm step in front of publishing. It is shown ALWAYS, not only when
// something is wrong: publishing locks the graph and activates the schedule, and
// a confirm that only sometimes appears trains people to click through the one
// time it matters. A clean graph therefore gets a single line, not a wall.
//
// It renders `collectPublishBlockers` and nothing else — every input arrives as
// a prop so the component stays testable without `mock.module`.

import type {
  AutomationCapabilitiesResponse,
  AutomationWorkflowDefinition,
  TestAutomationWorkflowResponse,
} from '@continuum/contracts';
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, PlugZap } from 'lucide-react';
import { useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  collectPublishBlockers,
  disableBlockingNodes,
  type PublishBlocker,
  summarizeTestFreshness,
} from '@/lib/automations/publish-readiness';

export type PublishReadinessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: AutomationWorkflowDefinition | null;
  capabilities?: AutomationCapabilitiesResponse | null;
  /** This session's server test, if one ran. `null` after a reload is expected. */
  testResult?: TestAutomationWorkflowResponse | null;
  publishing?: boolean;
  testing?: boolean;
  errorMessage?: string | null;
  /** Selects the offending node on the canvas; the caller supplies fitView. */
  onFocusNode: (nodeId: string) => void;
  /** Applies the escape-hatch patch. Re-checking happens when `definition` returns. */
  onApplyDefinition: (definition: AutomationWorkflowDefinition) => void;
  onRunTest: () => void;
  onConfirmPublish: () => void;
};

const BLOCKER_HEADINGS: Record<PublishBlocker['code'], string> = {
  capability_unavailable: 'Unavailable',
  capability_preview: 'Preview only',
  unset_configuration: 'Not configured',
  missing_webhook_binding: 'No binding',
};

export function PublishReadinessDialog({
  open,
  onOpenChange,
  definition,
  capabilities,
  testResult,
  publishing = false,
  testing = false,
  errorMessage,
  onFocusNode,
  onApplyDefinition,
  onRunTest,
  onConfirmPublish,
}: PublishReadinessDialogProps) {
  const uiText = useTranslations('automations');
  const readiness = useMemo(
    () => collectPublishBlockers({ definition, capabilities }),
    [definition, capabilities],
  );
  const freshness = useMemo(() => summarizeTestFreshness(testResult, uiText), [testResult, uiText]);

  const { blockers, warnings, blockingNodeIds } = readiness;
  const blocked = blockers.length > 0;

  const handleDisableBlockingNodes = () => {
    if (!definition || blockingNodeIds.length === 0) return;
    onApplyDefinition(disableBlockingNodes({ definition, blockingNodeIds }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{uiText('publish_this_workflow_6dbdde9')}</DialogTitle>
          <DialogDescription>
            {uiText('publishing_locks_the_graph_and_activates_the__fa4c405')}
          </DialogDescription>
        </DialogHeader>

        {blocked ? (
          <section className="space-y-2" aria-labelledby="publish-blockers-heading">
            <h3 id="publish-blockers-heading" className="text-xs font-medium text-secondary">
              {uiText.rich('sentence_4859ea4f69d3', { count: blockingNodeIds.length })}
            </h3>
            <ul className="space-y-2">
              {blockers.map((blocker) => (
                <li
                  key={`${blocker.nodeId}-${blocker.code}-${automationReadinessMessage(blocker, uiText).detail}`}
                >
                  <button
                    type="button"
                    onClick={() => onFocusNode(blocker.nodeId)}
                    className="flex w-full items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-left transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
                  >
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-xs font-medium">
                        {automationReadinessMessage(blocker, uiText).title} ·{' '}
                        {automationReadinessMessage(blocker, uiText).message}
                      </span>
                      <span className="block text-xs text-secondary">
                        {automationReadinessMessage(blocker, uiText).detail}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {warnings.length > 0 ? (
          <section className="space-y-2" aria-labelledby="publish-warnings-heading">
            <h3 id="publish-warnings-heading" className="text-xs font-medium text-secondary">
              {uiText.rich('sentence_67f39f689fdf', { count: warnings.length })}
            </h3>
            <ul className="space-y-2">
              {warnings.map((warning) => (
                <li key={`${warning.nodeId}-${warning.code}`}>
                  <button
                    type="button"
                    onClick={() => onFocusNode(warning.nodeId)}
                    className="flex w-full items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <PlugZap aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-xs font-medium">
                        {uiText('readinessConnection', { node: warning.nodeLabel })}
                      </span>
                      <span className="block text-xs text-secondary">
                        {uiText('needsConnectionDetail')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!blocked && warnings.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-secondary">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
            {uiText('every_enabled_step_is_wired_and_ready_to_run__98bc271')}
          </p>
        ) : null}

        <Alert>
          <FlaskConical aria-hidden="true" />
          <AlertTitle className="text-xs">{uiText('server_test_fbb2f1c')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">{freshness.message}</p>
            <Button size="sm" variant="outline" disabled={testing} onClick={onRunTest}>
              {uiText.rich('sentence_54a2616ab986', {
                v0: () =>
                  testing ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <FlaskConical data-icon="inline-start" />
                  ),
              })}
            </Button>
          </AlertDescription>
        </Alert>

        {errorMessage ? (
          <p role="alert" className="text-xs text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {uiText('cancel_19766ed')}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {blocked ? (
              <Button variant="outline" onClick={handleDisableBlockingNodes}>
                {uiText.rich('sentence_33c56f280bd8', {
                  v0: () =>
                    blockingNodeIds.length === 1
                      ? uiText('this_step_32635e8')
                      : `these ${blockingNodeIds.length} steps`,
                })}
              </Button>
            ) : null}
            <Button disabled={blocked || publishing || !definition} onClick={onConfirmPublish}>
              {uiText.rich('sentence_d37719a6076d', {
                v0: () =>
                  publishing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null,
              })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
