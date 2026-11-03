// The module's categorical palette (package AGENTS.md "Diseño"), validated for colour
// blindness, in fixed order: blue = sign-ups / Meta, aqua = goals / sign-ups, orange = costs,
// grey = floor / no contact. Declared as CSS variables on the dashboard root so dark mode
// swaps them through the app's own `dark:` variant.

export const PALETTE_ROOT_CLASS = [
  '[--ef-blue:#2a78d6] [--ef-orange:#eb6834] [--ef-aqua:#1baf7a]',
  'dark:[--ef-blue:#3987e5] dark:[--ef-orange:#d95926] dark:[--ef-aqua:#199e70]',
].join(' ');

export const SERIES_COLOR = {
  blue: 'var(--ef-blue)',
  orange: 'var(--ef-orange)',
  aqua: 'var(--ef-aqua)',
  grey: 'var(--muted-foreground)',
} as const;

export type SeriesColor = keyof typeof SERIES_COLOR;
