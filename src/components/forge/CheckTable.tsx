'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, CircleMinus } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

// A list of checks the way a deployment reads its steps: a mono name, what the check looks at,
// what it found, a tick per sub-step, and a round status mark. A row with a detail opens in place;
// its action stays a button of its own, never nested inside the row's toggle.

export type CheckState = 'pass' | 'warn' | 'fail' | 'running' | 'todo' | 'skipped';
export type CheckTick = 'pass' | 'warn' | 'fail' | 'todo';

export type CheckRow = {
  name: string;
  /** What the check looks at, as one plain sentence. */
  what: string;
  state: CheckState;
  /** What it found, in plain words. */
  result: ReactNode;
  ticks?: CheckTick[];
  chips?: ReactNode;
  duration?: string;
  detail?: ReactNode;
  action?: ReactNode;
};

const TICK_TONE: Record<CheckTick, string> = {
  pass: 'bg-success',
  warn: 'bg-warning',
  fail: 'bg-destructive',
  todo: 'bg-muted-foreground/30',
};

export function TickBar({ ticks, className }: { ticks: CheckTick[]; className?: string }) {
  const done = ticks.filter((tick) => tick === 'pass').length;
  return (
    <span
      role="img"
      aria-label={`${done} of ${ticks.length} done`}
      className={cn('flex h-3 items-stretch gap-px', className)}
    >
      {ticks.map((tick, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a tick is a position in a sequence and has no identity of its own
        <span key={index} className={cn('w-0.5 rounded-full', TICK_TONE[tick])} />
      ))}
    </span>
  );
}

const STATE_MARK: Record<
  Exclude<CheckState, 'running'>,
  { Icon: typeof CheckCircle2; tone: string; label: string }
> = {
  pass: { Icon: CheckCircle2, tone: 'text-success', label: 'Passed' },
  warn: { Icon: AlertTriangle, tone: 'text-warning', label: 'Warning' },
  fail: { Icon: AlertCircle, tone: 'text-destructive', label: 'Failed' },
  todo: { Icon: CircleDashed, tone: 'text-muted-foreground', label: 'Not done' },
  skipped: { Icon: CircleMinus, tone: 'text-muted-foreground', label: 'Skipped' },
};

function StateMark({ state }: { state: CheckState }) {
  if (state === 'running') return <Spinner role="img" aria-label="Running" className="size-3.5" />;
  const { Icon, tone, label } = STATE_MARK[state];
  return <Icon role="img" aria-label={label} className={cn('size-3.5', tone)} />;
}

/** "1 failed · 2 warnings", or "All checks passed" once nothing is failed, warned, running or left to do. */
export function checkSummary(rows: Array<Pick<CheckRow, 'state'>>): string {
  const count = (state: CheckState) => rows.filter((row) => row.state === state).length;
  const parts = [
    [count('fail'), 'failed', 'failed'],
    [count('warn'), 'warning', 'warnings'],
    [count('running'), 'running', 'running'],
    [count('todo'), 'to do', 'to do'],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return said.length ? said.join(' · ') : 'All checks passed';
}

function RowCells({ row }: { row: CheckRow }) {
  return (
    // Capped and led by its status mark, so on a wide screen the ticks, chips and duration stay
    // beside the sentence instead of drifting to the far edge.
    <div className="grid max-w-[60rem] grid-cols-[1rem_6.5rem_minmax(0,1fr)_auto_auto_3.5rem] items-center gap-x-3 px-[var(--card-pad)] py-1.5">
      <StateMark state={row.state} />
      <span className="font-mono text-2xs uppercase tracking-wide">{row.name}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs">{row.result}</span>
        <span className="hidden text-xs text-muted-foreground md:block">{row.what}</span>
      </span>
      {row.ticks?.length ? <TickBar ticks={row.ticks} /> : <span />}
      <span className="flex items-center gap-1">
        {row.chips}
        {/* Above the row's toggle, so pressing the action never also opens the row. */}
        {row.action ? <span className="relative z-10">{row.action}</span> : null}
      </span>
      <span className="text-right font-mono text-2xs tabular-nums text-muted-foreground">
        {row.duration}
      </span>
    </div>
  );
}

/** The row a person should look at first: the first failure that has something to show, else the first warning. */
const investigateTarget = (rows: CheckRow[]) =>
  rows.find((row) => row.state === 'fail' && row.detail) ??
  rows.find((row) => row.state === 'warn' && row.detail);

export function CheckTable({
  rows,
  label = 'Checks',
  action,
  className,
}: {
  rows: CheckRow[];
  label?: string;
  /** The next thing to do about what the footer counts. Defaults to opening the first problem. */
  action?: ReactNode;
  className?: string;
}) {
  // Open rows by name, held here rather than in each row, so a detail that disappears while its
  // data reloads comes back open, and the footer can open the row it points at.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const summary = checkSummary(rows);
  const failing = rows.some((row) => row.state === 'fail');
  const warning = rows.some((row) => row.state === 'warn');
  const target = investigateTarget(rows);
  const investigate = target ? (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={() => {
        setOpen((current) => ({ ...current, [target.name]: true }));
        triggers.current[target.name]?.focus();
      }}
    >
      Investigate
    </Button>
  ) : null;

  return (
    <div className={cn('flex flex-col', className)}>
      <ul aria-label={label} className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.name}>
            <Collapsible
              className="group/check"
              open={Boolean(row.detail && open[row.name])}
              onOpenChange={(next) => setOpen((current) => ({ ...current, [row.name]: next }))}
            >
              <div
                className={cn(
                  'relative',
                  row.detail && 'hover:bg-muted/30 group-data-open/check:bg-muted/30',
                )}
              >
                {row.detail ? (
                  <CollapsibleTrigger
                    ref={(node) => {
                      triggers.current[row.name] = node;
                    }}
                    aria-label={`${row.name} details`}
                    className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  />
                ) : null}
                <RowCells row={row} />
              </div>
              {row.detail ? (
                <CollapsibleContent className="max-w-[60rem] border-t border-dashed border-border px-[var(--card-pad)] py-2 text-xs md:pl-[calc(var(--card-pad)+9rem)]">
                  {row.detail}
                </CollapsibleContent>
              ) : null}
            </Collapsible>
          </li>
        ))}
      </ul>
      <div className="border-t border-border">
        <div className="flex min-h-8 max-w-[60rem] items-center justify-between gap-2 px-[var(--card-pad)] py-1">
          <p
            role="status"
            className={cn(
              'font-mono text-2xs uppercase tracking-wide',
              failing ? 'text-destructive' : warning ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            {summary}
          </p>
          {action ?? investigate}
        </div>
      </div>
    </div>
  );
}
