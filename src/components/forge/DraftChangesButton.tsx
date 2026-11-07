'use client';

import { History, Undo2 } from 'lucide-react';
import type { DraftChange } from '@/components/forge/draftChanges';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** "Changes": what this draft changes against the revision it started from, one layer per row. */
export function DraftChangesButton({
  changes,
  baseLabel,
  disabled = false,
  onUndo,
}: {
  changes: readonly DraftChange[];
  /** What the draft started from: "the original" or "<variant> · Revision N". */
  baseLabel: string;
  disabled?: boolean;
  onUndo: (key: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant="ghost">
            <History data-icon="inline-start" aria-hidden />
            Changes{changes.length ? ` (${changes.length})` : ''}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-3">
        <p className="mb-2 text-xs font-medium">Changes from {baseLabel}</p>
        {changes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No changes yet: this draft matches {baseLabel}.</p>
        ) : (
          <ul aria-label="Changes in this draft" className="flex flex-col gap-1.5">
            {changes.map((change) => (
              <li key={change.key} className="flex items-start justify-between gap-2 text-xs">
                <span className="min-w-0 text-pretty">
                  <span className="font-medium">{change.name}</span>: {change.changes.join(', ')}
                </span>
                {change.undoable ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Undo changes to ${change.name}`}
                    onClick={() => onUndo(change.key)}
                  >
                    <Undo2 data-icon="inline-start" aria-hidden />
                    Undo
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-2xs text-muted-foreground">
          {baseLabel === 'the original' ? 'The original' : `${baseLabel}`} stays unchanged. Undo a layer here, or
          use Discard edits to start over.
        </p>
      </PopoverContent>
    </Popover>
  );
}
