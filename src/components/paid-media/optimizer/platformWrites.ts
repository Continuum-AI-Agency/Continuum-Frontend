// Whether the Optimizer may write a platform's budgets in a portfolio (G5). The portfolio list
// carries platform_writes — portfolio_platforms.apply_enabled, 20261017090000: Meta writes unless
// its row is switched off, any other platform only with its row switched on. A move nobody may
// write stays on the chart as a proposal and is never offered for approval: approving it would
// leave the row approved_pending while the service refuses it (apply_disabled).
import type { CycleItemRow, PortfolioListItem } from '@continuum/contracts';
import { entityOf, platformName } from './entityNoun';

type WritesSource = Pick<PortfolioListItem, 'platform_writes'>;

export function platformWritable(
  portfolio: WritesSource,
  platform: string | null | undefined,
): boolean {
  const writes = portfolio.platform_writes ?? {};
  const id = platform || 'meta';
  return id === 'meta' ? writes.meta !== false : writes[id] === true;
}

/** A cycle item's own platform; Meta when the row names none. */
const itemPlatform = (item: CycleItemRow): string =>
  entityOf(item as Record<string, unknown>)?.platform ?? 'meta';

export function itemWritable(portfolio: WritesSource, item: CycleItemRow): boolean {
  return platformWritable(portfolio, itemPlatform(item));
}

/** "2 budget moves on Google Ads are proposals only — writes to Google Ads are switched off for
 *  this portfolio." Null when every proposed move can be approved. */
export function proposalsOnlyNote(
  portfolio: WritesSource,
  items: readonly CycleItemRow[],
): string | null {
  const held = items.filter(
    (item) =>
      item.apply_status == null && (item.change_abs ?? 0) !== 0 && !itemWritable(portfolio, item),
  );
  if (held.length === 0) return null;
  const names = [
    ...new Set(held.map((item) => platformName({ platform: itemPlatform(item), level: null }))),
  ].join(' and ');
  const moves = held.length === 1 ? '1 budget move' : `${held.length} budget moves`;
  return `${moves} on ${names} ${held.length === 1 ? 'is a proposal' : 'are proposals'} only — writes to ${names} are switched off for this portfolio.`;
}
