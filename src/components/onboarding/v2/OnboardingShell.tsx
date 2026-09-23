import { ContinuumWordmark } from '@/components/shared/ContinuumWordmark';
import { OnboardingStepper, type StepperState } from './OnboardingStepper';
import { StartOverButton } from './StartOverButton';

export type ShellPillId =
  | 'website'
  | 'documents'
  | 'catalog'
  | 'integrations'
  | 'invites'
  | 'dna'
  | 'plan';

type StepDef = { id: ShellPillId; label: string; description: string; state: StepperState };

type OnboardingShellProps = {
  steps: StepDef[];
  onStepClick?: (id: ShellPillId) => void;
  bottomHint: string;
  bottomActions: React.ReactNode;
  onStartOver?: () => void;
  startOverDisabled?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
};

export function OnboardingShell({
  steps,
  onStepClick,
  bottomHint,
  bottomActions,
  onStartOver,
  startOverDisabled,
  headerRight,
  children,
}: OnboardingShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <ContinuumWordmark />
          <div className="flex items-center gap-3">
            <p className="hidden text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground md:block">
              Get set up
            </p>
            {headerRight}
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-4">
          <OnboardingStepper steps={steps} onStepClick={onStepClick} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <footer className="border-t border-border bg-white dark:bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {onStartOver ? (
              <StartOverButton onConfirm={onStartOver} disabled={startOverDisabled} />
            ) : null}
            <span className="truncate text-sm leading-snug text-muted-foreground">
              {bottomHint}
            </span>
          </div>
          <div className="flex items-center gap-2.5">{bottomActions}</div>
        </div>
      </footer>
    </div>
  );
}
