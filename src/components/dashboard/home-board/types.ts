// The seam between the Home board and its tiles. The server wrapper reads the brand once (its
// accounts, saved goals, reading and board); the board lays the tiles out and hands every tile
// the same context plus its own board entry. A tile fetches what it draws through existing hooks
// (React Query dedupes them), so no tile depends on another one.
//
// Change these types additively only: every tile under ./modules renders from them.
import type {
  HomeBoard,
  HomeBoardTile,
  HomeBrandReading,
  HomeProfileRow,
} from '@continuum/contracts';
import type { DashboardSetupState } from '@/components/dashboard/first-run/setupState';
import type { HomeAdAccount } from '@/lib/home/useHomeOverviewData';
import type { SnapshotAccountRef } from '@/lib/organic/brandOrganicSnapshot';

export type HomeBoardContext = {
  brandId: string;
  brandName: string | null;
  /** The signed-in member; pins are kept per member in this browser. */
  userId: string | null;
  /** Meta ad accounts and Google Ads customers (never an MCC), each with its stored currency. */
  adAccounts: HomeAdAccount[];
  organicAccounts: SnapshotAccountRef[];
  /** The saved goals, per scope (brand or one ad account). */
  profileRows: HomeProfileRow[];
  reading: HomeBrandReading;
  board: HomeBoard;
  /** First-run setup state (accounts, Brand Book); the setup tile reads it. */
  setup: DashboardSetupState | null;
  brandBookRefreshedAt: string | null;
};

export type HomeTileProps = {
  ctx: HomeBoardContext;
  tile: HomeBoardTile;
};
