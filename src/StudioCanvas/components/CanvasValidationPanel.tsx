import type { GraphIssue } from '@continuum/contracts';
import { ShieldCheck } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';

import { Panel } from '@/components/ai-elements/panel';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// The graph's own complaints, parked top-right so they read as a review queue rather
// than as errors on the nodes. Clicking one selects and frames the node it names.
export function CanvasValidationPanel({
  issues,
  onFocusIssue,
}: {
  issues: GraphIssue[];
  onFocusIssue: (nodeId: string) => void;
}) {
  const translateUi = useUiTranslations('studio');

  if (issues.length === 0) return null;

  return (
    <Panel position="top-right" className="border-none bg-transparent p-0 shadow-none">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-2 bg-background/95 text-xs"
              aria-label={translateUi('value0_workflow_validation_issue_va_53ebd794', {
                count: Number(issues.length),
              })}
            >
              <ShieldCheck className="size-3.5" aria-hidden />
              {issues.length} {translateUi('to_review_07024d06')}{' '}
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80 p-2">
          <p className="px-2 py-1 text-xs font-medium">{translateUi('workflow_checks_40379ec3')}</p>
          <div className="flex max-h-64 flex-col overflow-y-auto">
            {issues.map((issue: GraphIssue, index) => (
              <button
                key={`${issue.code}:${issue.nodeId ?? issue.edgeId ?? index}`}
                type="button"
                className="rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  if (!issue.nodeId) return;
                  onFocusIssue(issue.nodeId);
                }}
              >
                <span className="block font-medium">
                  {issue.phase === 'run'
                    ? translateUi('before_running_e16ef722')
                    : translateUi('connection_639a40e8')}
                </span>
                <span className="mt-0.5 block text-muted-foreground">{issue.message}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </Panel>
  );
}
