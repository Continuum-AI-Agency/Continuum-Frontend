'use client';

// G08 Quality: keyword spend by Quality Score.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function QualityLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-quality"
      title="Quality Score"
    >
      <p className="text-muted-foreground text-xs">Quality Score</p>
    </ModuleFrame>
  );
}
