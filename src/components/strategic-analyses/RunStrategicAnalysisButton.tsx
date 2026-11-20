'use client';

import { Rocket } from 'lucide-react';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { runStrategicAnalysis } from '@/lib/api/strategicAnalyses.client';
import { requestStrategicRunsCatchUp } from './realtimeBus';

type Props = {
  brandProfileId: string;
  compact?: boolean;
};

export function RunStrategicAnalysisButton({ brandProfileId, compact = false }: Props) {
  const getUiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('common');

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
          title: tUi('m_5b5a87753b'),
          description: details ? tUi('m_cbe5c04c51', { v0: String(details) }) : tUi('m_74e8d164fb'),
          variant: 'success',
        });
        void requestStrategicRunsCatchUp(brandProfileId);
      } catch (e: unknown) {
        const message = getUiErrorMessage(e);
        setError(message);
        show({ title: tUi('m_9a731f3d6d'), description: message, variant: 'error' });
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">{tUi('m_c3ba9398c5')}</p>
          <p className="text-sm text-muted-foreground">{tUi('m_cb24f79377')}</p>
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <Rocket aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button onClick={handleRun} disabled={isPending} size={compact ? 'default' : 'lg'}>
        {isPending ? tUi('m_2aeb6d67d0') : tUi('m_546af0471c')}
      </Button>
    </div>
  );
}
