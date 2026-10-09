'use client';

// The four tiles under the anchor (P1, "Lectura continua"): no box at all — a 12px label, a
// 22px figure and two 12px lines, the tiles split by thin vertical hairlines. Four columns on a
// desktop pane, two by two below 56rem, measured on the pane. A tile's verdict (ok / warn / bad)
// colours its figure, never a bar. Which four is decided in ./headlineModel (relevantTiles).

import { cn } from '@/lib/utils';
import { KpiTile, type KpiTileState } from '../../components/KpiTile';
import { figureProps } from '../../format';
import type { ModuleTile } from './headlineModel';
import type { HeroSetting } from './heroHeaderModel';
import { SETTING_TEXT } from './PortfolioHeaderLine';

export type PortfolioTilesProps = {
  tiles: ModuleTile[];
  onEditSetting: (setting: HeroSetting) => void;
};

/** KpiTile is shared with the account Overview; the module strips its frame and its rule. */
const FRAMELESS = 'rounded-none border-0 bg-transparent p-0';

/** The verdict on the figure itself, the one place green or red is allowed in a tile. */
const STATE_FIGURE: Record<KpiTileState, string> = {
  ok: '[&_[data-figure-role=tile]]:text-success',
  warn: '[&_[data-figure-role=tile]]:text-warning',
  bad: '[&_[data-figure-role=tile]]:text-destructive',
  none: '',
};

/**
 * The hairline left of a tile. Two columns below 56rem put tiles 2 and 4 on the right; four
 * columns above it put every tile but the first beside another.
 */
function hairline(index: number): string {
  if (index === 0) return '';
  if (index % 2 === 1) return 'border-border/60 border-l pl-4';
  return '@[56rem]/news:border-border/60 @[56rem]/news:border-l @[56rem]/news:pl-4';
}

export function PortfolioTiles({ tiles, onEditSetting }: PortfolioTilesProps) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-4 @[56rem]/news:grid-cols-4"
      data-testid="portfolio-tiles"
    >
      {tiles.map((tile, index) => (
        <div className={cn('min-w-0', hairline(index))} key={tile.key}>
          <KpiTile
            className={cn(FRAMELESS, STATE_FIGURE[tile.state])}
            figure={figureProps(
              tile.figure.key,
              tile.figure.raw,
              tile.figure.currency,
              tile.figure.window,
              tile.figure.unit,
            )}
            label={tile.label}
            state={tile.state}
            sub={
              <>
                <span className="block truncate">
                  {tile.sub.map((segment) =>
                    typeof segment === 'string' ? (
                      segment
                    ) : (
                      <button
                        className={SETTING_TEXT}
                        data-setting={segment.setting}
                        data-testid="header-chip"
                        key={segment.setting}
                        onClick={() => onEditSetting(segment.setting)}
                        title="Edit in Manage"
                        type="button"
                      >
                        {segment.text}
                      </button>
                    ),
                  )}
                </span>
                {tile.detail ? (
                  <span className="block truncate" data-testid="kpi-detail">
                    {tile.detail}
                  </span>
                ) : null}
              </>
            }
            testId={`tile-${tile.key}`}
            value={tile.value}
          />
        </div>
      ))}
    </div>
  );
}
