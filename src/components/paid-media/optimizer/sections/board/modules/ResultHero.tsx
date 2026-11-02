'use client';

// O02 Result hero: the result that counts against its goal, with its trend.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../ModuleFrame';
import type { BoardModuleProps } from '../types';

export default function ResultHero({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame reason={slot.reason} size={slot.size} testId="board-module-result" title="Result">
      <p className="text-muted-foreground text-xs">Result</p>
    </ModuleFrame>
  );
}
