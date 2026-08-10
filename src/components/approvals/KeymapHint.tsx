'use client';

import { HelpCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const KEYMAP: Array<{ keys: string[]; label: string }> = [
  { keys: ['J', '→'], label: 'Next action' },
  { keys: ['K', '←'], label: 'Previous action' },
  { keys: ['A', '⏎'], label: 'Approve focused' },
  { keys: ['R'], label: 'Reject…' },
  { keys: ['P'], label: 'View raw payload' },
  { keys: ['S'], label: 'Skip without deciding' },
  { keys: ['T'], label: 'Toggle queue view' },
];

export function KeymapHint() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label="Keyboard shortcuts"
          >
            <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        }
      />
      <PopoverContent side="bottom" align="end" className="w-72 p-3">
        <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          Keyboard
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
