import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

type PlannerHeaderProps = {
  title: string;
  subtitle?: string;
  onPreviousWeek: () => void;
  onToday: () => void;
  onNextWeek: () => void;
};

export function PlannerHeader({
  title,
  subtitle,
  onPreviousWeek,
  onToday,
  onNextWeek,
}: PlannerHeaderProps) {
  const uiText = useTranslations('organic');
  return (
    <header
      data-tour-id="organic-calendar-controls"
      className="flex flex-wrap items-start justify-between gap-3 pb-1"
    >
      <div className="space-y-0.5">
        <h1 className="text-base font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        <ButtonGroup aria-label={uiText('week_navigation_f23f3ad')}>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onPreviousWeek}
            aria-label={uiText('previous_week_c0f8bbc')}
          >
            <ChevronLeft />
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={onToday}>
            {uiText('today_2b065c7')}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onNextWeek}
            aria-label={uiText('next_week_21fbde1')}
          >
            <ChevronRight />
          </Button>
        </ButtonGroup>
      </div>
    </header>
  );
}
