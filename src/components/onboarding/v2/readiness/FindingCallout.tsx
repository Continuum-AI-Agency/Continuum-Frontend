import { Sparkles } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ReadinessFinding } from '@/lib/onboarding/agentClient';
import { bandFor, type ScoreBand } from './ScoreBadge';

const TINT: Record<ScoreBand, string> = {
  strong:
    'bg-[color-mix(in_srgb,#0daea2_4%,white)] border-[color-mix(in_srgb,#0daea2_18%,transparent)]',
  watch:
    'bg-[color-mix(in_srgb,#f59e0b_5%,white)] border-[color-mix(in_srgb,#f59e0b_22%,transparent)]',
  weak: 'bg-[color-mix(in_srgb,#e11d48_4%,white)] border-[color-mix(in_srgb,#e11d48_22%,transparent)]',
};

const ICON_TONE: Record<ScoreBand, string> = {
  strong: 'text-[#0a8a80]',
  watch: 'text-[#b45309]',
  weak: 'text-[#be123c]',
};

export function FindingCallout({ finding }: { finding: ReadinessFinding }) {
  const band = bandFor(finding.score);
  return (
    <div className="space-y-2.5">
      <Separator className="opacity-60" />
      <div className={`rounded-md border p-3 ${TINT[band]}`}>
        <div className="flex items-start gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Sparkles
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 cursor-default ${ICON_TONE[band]}`}
                  />
                }
              />
              <TooltipContent side="left">AI insight</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#0b1220]">{finding.headline}</p>
            <p className="text-sm leading-snug text-[#374151]">{finding.detail}</p>
            <p className="pt-1 text-sm leading-snug text-[#0b1220]">
              <span className="font-semibold">Try this · </span>
              {finding.recommendation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
