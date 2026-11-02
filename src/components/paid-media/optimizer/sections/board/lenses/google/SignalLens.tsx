'use client';

// G10 Signal: what Google counts as a conversion against the results that count.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function SignalLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-signal"
      title="Conversion signal"
    >
      <p className="text-muted-foreground text-xs">Conversion signal</p>
    </ModuleFrame>
  );
}
