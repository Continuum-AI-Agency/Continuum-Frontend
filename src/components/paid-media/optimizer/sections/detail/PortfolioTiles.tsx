'use client';

// The four tiles of the portfolio module (portafolio-unificado.html, idea D): no frame of
// their own — the module is the one surface — only the state rule on their top edge, a
// 12px label, a 22px figure and two 12px lines. Four columns on a desktop pane, two by two
// below 56rem, measured on the pane. Which four is decided in ./headlineModel (relevantTiles).

import { KpiTile } from '../../components/KpiTile';
import { figureProps } from '../../format';
import type { ModuleTile } from './headlineModel';
import type { HeroSetting } from './heroHeaderModel';
import { SETTING_TEXT } from './PortfolioHeaderLine';

export type PortfolioTilesProps = {
  tiles: ModuleTile[];
  onEditSetting: (setting: HeroSetting) => void;
};

/** KpiTile is shared with the account Overview; the module only strips its frame. */
const FRAMELESS = 'rounded-none border-0 border-t-2 bg-transparent px-0 pb-0 pt-2.5';

export function PortfolioTiles({ tiles, onEditSetting }: PortfolioTilesProps) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-4 @[56rem]/news:grid-cols-4"
      data-testid="portfolio-tiles"
    >
      {tiles.map((tile) => (
        <KpiTile
          className={FRAMELESS}
          figure={figureProps(
            tile.figure.key,
            tile.figure.raw,
            tile.figure.currency,
            tile.figure.window,
            tile.figure.unit,
          )}
          key={tile.key}
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
                      title="Editar en Manage"
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
      ))}
    </div>
  );
}
