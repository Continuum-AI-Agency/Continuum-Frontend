'use client';

import { HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const getKEYMAP = (
  tUi: ReturnType<typeof useTranslations<'common'>>,
): Array<{ keys: string[]; label: string }> => [
  { keys: ['J', '→'], label: tUi('next_action_365987d') },
  { keys: ['K', '←'], label: tUi('previous_action_730c9f9') },
  { keys: ['A', '⏎'], label: tUi('m_17ea001ee2') },
  { keys: ['R'], label: tUi('m_ca5aa8c9f5') },
  { keys: ['P'], label: tUi('m_f9816af43f') },
  { keys: ['S'], label: tUi('m_6d779c89ee') },
  { keys: ['T'], label: tUi('m_629493d230') },
];

export function KeymapHint() {
  const tUi = useTranslations('common');
  const KEYMAP = getKEYMAP(tUi);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={tUi('m_266695479a')}
          >
            <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        }
      />
      <PopoverContent side="bottom" align="end" className="w-72 p-3">
        <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {tUi('m_6662c40bac')}
        </div>
        <ul className="space-y-1.5">
          {KEYMAP.map(({ keys, label }) => (
            <li key={label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-foreground">{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-data text-2xs text-muted-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
