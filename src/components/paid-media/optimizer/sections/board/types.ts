// The seam between the adaptive board and its modules. The board reads the account
// (useAdAccountReading), lays the reading's slots out in order, and hands every module the same
// context plus its own slot. A module fetches the figures it draws through the existing hooks
// (React Query dedupes them), so a module never depends on another one.
//
// Change these types additively only: every module in board/modules and board/lenses renders
// from them.
import type {
  AdAccountBoardSlot,
  AdAccountReading,
  BoardModuleSize,
  PortfolioListItem,
} from '@continuum/contracts';

export type BoardPlatform = 'meta' | 'google_ads';

export type BoardContext = {
  brandId: string;
  platform: BoardPlatform;
  /** The account the board reads. The Meta tab passes the selected act_ id. The Google tab
   *  passes null and its modules resolve the brand's Google Ads account themselves. */
  adAccountId: string | null;
  currency: string | null;
  /** The platform's portfolios, as the Overview receives them. */
  portfolios: PortfolioListItem[];
  reading: AdAccountReading;
  onOpenActions: () => void;
  onOpenActivity: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
};

export type BoardModuleProps = {
  ctx: BoardContext;
  slot: AdAccountBoardSlot;
};

/** Grid spans per size, on the board's 1 / 2 / 4 column grid. Every module frame uses these,
 *  so a size means the same footprint everywhere. */
export const BOARD_SIZE_CLASS: Record<BoardModuleSize, string> = {
  s: 'col-span-1',
  m: 'col-span-1 md:col-span-2',
  l: 'col-span-1 md:col-span-2 xl:row-span-2',
  w: 'col-span-1 md:col-span-2 xl:col-span-4',
};
