// The flywheel's three lanes (H10), each fed by a read that exists today or honestly marked as
// not available:
//   Organic → Paid      the brand's organic winners (organic_get_winners via /api/organic/winners);
//                       a winner runs as a PAUSED ad through the existing promote route.
//   Paid → Creative     ads the stored creative report says need a new creative (underperforming,
//                       needs a new angle), from the Creative module's own read.
//   Creative → Organic  no source: nothing links a paid variant to an organic draft yet.
import type { OrganicWinner } from '@continuum/contracts';

export type FlywheelLaneId = 'organic-to-paid' | 'paid-to-creative' | 'creative-to-organic';

export type FlywheelLane = {
  id: FlywheelLaneId;
  label: string;
  /** What the lane lists, in one line. */
  description: string;
  available: boolean;
};

export const FLYWHEEL_LANES: readonly FlywheelLane[] = [
  {
    id: 'organic-to-paid',
    label: 'Organic → Paid',
    description: 'Posts that beat the account’s median, ready to run as a paused ad.',
    available: true,
  },
  {
    id: 'paid-to-creative',
    label: 'Paid → Creative',
    description: 'Ads the creative report says need a new creative.',
    available: true,
  },
  {
    id: 'creative-to-organic',
    label: 'Creative → Organic',
    description: 'New variants to publish as organic posts.',
    available: false,
  },
];

export const FLYWHEEL_SENTENCES = {
  noWinners:
    'No organic winners yet — a post counts after 3 days, once the Instagram account has metric snapshots to compare it against.',
  winnersFailed: 'The organic winners could not be read.',
  nothingToRefresh: 'No ad needs a new creative in the stored creative report.',
  noReport: 'No creative report yet, so no ad is flagged for a new creative.',
  notAvailable:
    'Not available yet — Continuum does not link a paid variant to an organic draft, so this lane has nothing to list.',
} as const;

const MEDIA_LABEL: Record<string, string> = {
  VIDEO: 'Reel',
  IMAGE: 'Image',
  CAROUSEL_ALBUM: 'Carousel',
};

export function winnerTitle(winner: OrganicWinner): string {
  return winner.hookText ?? `${MEDIA_LABEL[winner.mediaType ?? ''] ?? 'Post'} ${winner.mediaId}`;
}

export function liftLine(winner: OrganicWinner): string | null {
  const parts = [
    winner.reachLift === null ? null : `reach ${winner.reachLift.toFixed(1)}×`,
    winner.engagementRateLift === null
      ? null
      : `engagement ${winner.engagementRateLift.toFixed(1)}×`,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const line = `${parts.join(' · ')} the account median`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}
