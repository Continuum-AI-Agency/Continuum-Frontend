'use client';

import { CheckCircledIcon, CircleIcon, CrossCircledIcon } from '@radix-ui/react-icons';

import { Pill } from '@/components/kibo-ui/pill';
import { Spinner } from '@/components/ui/Loading';

export type TestResult = {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'running' | 'pending';
  duration?: string;
  error?: string;
};

type TestResultsProps = {
  results: TestResult[];
  title?: string;
};

export function TestResults({ results, title = 'Test Results' }: TestResultsProps) {
  const passing = results.filter((r) => r.status === 'pass').length;
  const failing = results.filter((r) => r.status === 'fail').length;
  const total = results.length;

  return (
    <div className="w-full overflow-hidden rounded-lg border bg-muted/40">
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-secondary">{title}</span>
          <div className="flex gap-2">
            {passing > 0 && <Pill variant="success">{passing} passed</Pill>}
            {failing > 0 && <Pill variant="destructive">{failing} failed</Pill>}
            <Pill variant="muted">{total} total</Pill>
          </div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {results.map((result) => (
          <div
            key={result.id}
            className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-3">
              <StatusIcon status={result.status} />
              <div>
                <div
                  className={
                    result.status === 'fail'
                      ? 'text-sm text-destructive'
                      : 'text-sm text-foreground'
                  }
                >
                  {result.name}
                </div>
                {result.error && (
                  <div className="mt-0.5 text-xs text-destructive">{result.error}</div>
                )}
              </div>
            </div>
            {result.duration && (
              <span className="text-xs text-muted-foreground">{result.duration}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: TestResult['status'] }) {
  switch (status) {
    case 'pass':
      return <CheckCircledIcon className="h-4 w-4 text-success" aria-hidden="true" />;
    case 'fail':
      return <CrossCircledIcon className="h-4 w-4 text-destructive" aria-hidden="true" />;
    case 'running':
      return <Spinner size={16} />;
    default:
      return <CircleIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}
