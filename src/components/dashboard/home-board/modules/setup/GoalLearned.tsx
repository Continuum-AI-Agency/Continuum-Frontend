// What the Home already learned about the brand before anything is connected: the goal the
// reading leads with (from the Brand Book's description when it says enough) and why.
import type { HomeBrandReading } from '@continuum/contracts';
import { cn } from '@/lib/utils';

export function GoalLearned({
  goal,
  className,
}: {
  goal: HomeBrandReading['goal'];
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)} data-testid="home-setup-goal">
      <p className="truncate text-xs">
        <span className="text-muted-foreground">Goal · </span>
        <span className="font-medium">{goal.label}</span>
      </p>
      <p className="text-muted-foreground text-xs leading-snug">{goal.detail}</p>
    </div>
  );
}
