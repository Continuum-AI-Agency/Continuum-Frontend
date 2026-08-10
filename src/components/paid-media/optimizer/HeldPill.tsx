'use client';

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { freezeLabel } from './reportModel';

// A held ad set was left unchanged ON PURPOSE (CBO/lifetime budget, no conversion
// signal, thin window) — never a $0.00 change. One canonical pill fed by
// reportModel.freezeLabel, replacing the amber chip that was hand-rolled across
// the optimizer sections. The warning indicator + hint tooltip carry the reason;
// semantic tokens keep light/dark automatic. Renders nothing when not held.
export function HeldPill({ reason }: { reason: string | null | undefined }) {
  const held = freezeLabel(reason);
  if (!held) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pill variant="secondary" className="cursor-default">
              <PillIndicator variant="warning" />
              {held.label}
            </Pill>
          </button>
        }
      />
      <TooltipContent className="max-w-64 text-xs">{held.hint}</TooltipContent>
    </Tooltip>
  );
}
