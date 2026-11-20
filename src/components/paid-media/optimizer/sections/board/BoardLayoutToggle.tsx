'use client';

// "Adaptive · Today": the switch between the board and Today's fixed Overview. The active option
// wears one pill that slides between the two (a shared layout, so it also travels when the
// switch itself moves from the board's header to Today's bar); under reduced motion it jumps.

import { SparklesIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { BoardLayout } from './boardLayout';

const OPTIONS = [
  { value: 'adaptive', label: 'adaptive_ceb6931' },
  { value: 'today', label: 'today_2b065c7' },
] as const satisfies readonly { value: BoardLayout; label: string }[];

export function BoardLayoutToggle({
  value,
  onChange,
}: {
  value: BoardLayout;
  onChange: (next: BoardLayout) => void;
}) {
  const uiText = useTranslations('scale');
  const reduce = useReducedMotion();
  return (
    <ToggleGroup
      aria-label={uiText('overview_layout_969722f')}
      className="shrink-0"
      data-testid="board-layout-toggle"
      onValueChange={(next) => {
        const picked = String(next);
        if (picked === 'adaptive' || picked === 'today') onChange(picked);
      }}
      size="sm"
      spacing={0}
      type="single"
      value={value}
      variant="outline"
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem
          className="relative gap-1.5 px-2.5 text-xs aria-pressed:bg-transparent aria-pressed:text-foreground"
          data-testid={`board-layout-${option.value}`}
          key={option.value}
          value={option.value}
        >
          {value === option.value ? (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-[inherit] bg-primary/10"
              layoutId={reduce ? undefined : 'board-layout-pill'}
              transition={{ type: 'spring', visualDuration: 0.35, bounce: 0.14 }}
            />
          ) : null}
          <span className="relative inline-flex items-center gap-1.5">
            {option.value === 'adaptive' ? (
              <SparklesIcon aria-hidden="true" className="size-3.5 text-primary-ink" />
            ) : null}
            {uiText(option.label)}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
