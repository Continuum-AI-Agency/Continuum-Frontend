'use client';
import { Rocket } from 'lucide-react';

import { useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { runStrategicAnalysis } from '@/lib/api/strategicAnalyses.client';
import { requestStrategicRunsCatchUp } from './realtimeBus';

type Props = {
  brandProfileId: string;
  compact?: boolean;
};

export function RunStrategicAnalysisButton({ brandProfileId, compact = false }: Props) {
  const { show } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runStrategicAnalysis(brandProfileId);
        const details = result.runId ?? result.taskId ?? result.status ?? undefined;
        show({
          title: 'Strategic analysis queued',
          description: details
            ? `Run reference: ${details}`
            : 'Regeneration requested for this brand.',
          variant: 'success',
        });
        void requestStrategicRunsCatchUp(brandProfileId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unable to start strategic analysis run.';
        setError(message);
        show({ title: 'Run failed', description: message, variant: 'error' });
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">Strategic analyses</p>
          <p className="text-sm text-muted-foreground">
            Manually queue a fresh strategic analysis when no results exist for this brand.
          </p>
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <Rocket aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button onClick={handleRun} disabled={isPending} size={compact ? 'default' : 'lg'}>
        {isPending ? 'Queuing...' : 'Run analysis'}
      </Button>
    </div>
  );
}
