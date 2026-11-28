import type { DocumentRegionCategory } from '@continuum/contracts';
import {
  AlignLeft,
  CircleDollarSign,
  Hash,
  Heading,
  ImageIcon,
  type LucideIcon,
  PenLine,
  Square,
  Table2,
  UserRound,
} from 'lucide-react';

/** Each category's colour is a chart token, so it follows the theme in light and dark. */
export const REGION_STYLE: Record<DocumentRegionCategory, { color: string; icon: LucideIcon }> = {
  party: { color: 'var(--chart-4)', icon: UserRound },
  identifiers: { color: 'var(--chart-1)', icon: Hash },
  table: { color: 'var(--chart-2)', icon: Table2 },
  amount: { color: 'var(--chart-3)', icon: CircleDollarSign },
  annotation: { color: 'var(--chart-5)', icon: PenLine },
  heading: { color: 'var(--muted-foreground)', icon: Heading },
  text: { color: 'var(--muted-foreground)', icon: AlignLeft },
  figure: { color: 'var(--muted-foreground)', icon: ImageIcon },
  other: { color: 'var(--muted-foreground)', icon: Square },
};
