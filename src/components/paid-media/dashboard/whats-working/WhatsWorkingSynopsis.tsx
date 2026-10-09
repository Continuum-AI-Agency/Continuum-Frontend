// The 2-3 theme read above the verdicts and the win-rate sections, as plain text under a
// small label — no panel of its own. Written server-side by a Flash-Lite pass at most every
// few days; renders nothing until the first one exists.

import type { PaidCreativeSynopsis } from '@continuum/contracts';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WhatsWorkingSynopsis({
  synopsis,
  className,
}: {
  synopsis: PaidCreativeSynopsis | null | undefined;
  className?: string;
}) {
  if (!synopsis || synopsis.themes.length === 0) return null;
  return (
    <div className={cn('space-y-1', className)}>
      <p className="flex items-center gap-1 font-medium text-xs text-muted-foreground uppercase tracking-wide">
        <Sparkles className="size-3" />
        Themes
        <span className="font-normal normal-case tracking-normal">
          · updated {new Date(synopsis.generatedAt).toLocaleDateString()}
        </span>
      </p>
      <ul className="space-y-0.5">
        {synopsis.themes.map((theme) => (
          <li className="text-foreground text-xs leading-snug" key={theme}>
            {theme}
          </li>
        ))}
      </ul>
    </div>
  );
}
