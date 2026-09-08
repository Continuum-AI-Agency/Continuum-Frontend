'use client';

import { DEFAULT_PROJECT_COLOR, type Project } from '@continuum/contracts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * A colour-coded project chip.
 *
 * There is no arbitrary-colour badge primitive in this repo, so this reuses the pattern that
 * already works in ScoreBadge: `<Badge variant="outline">` plus inline style. The tint and
 * border go through `color-mix` so one stored hex reads correctly in both themes instead of
 * needing a light and a dark value per project.
 */

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * `projects.color` is free-form text in the database — the API validates hex on write, but a
 * row written before that, or by hand, must not take the chip's background down with it: an
 * invalid colour inside `color-mix()` drops the whole declaration silently.
 */
export function projectColor(color: string | null | undefined): string {
  return color && HEX.test(color) ? color : DEFAULT_PROJECT_COLOR;
}

type ProjectChipProps = {
  project: Pick<Project, 'name' | 'color'>;
  className?: string;
  /** Hidden when the chip sits beside its own colour swatch, e.g. inside the selector. */
  showDot?: boolean;
};

export function ProjectChip({ project, className, showDot = true }: ProjectChipProps) {
  const color = projectColor(project.color);
  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 border', className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      {showDot && (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate font-medium">{project.name}</span>
    </Badge>
  );
}
