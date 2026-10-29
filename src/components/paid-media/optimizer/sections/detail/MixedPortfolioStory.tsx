'use client';

// A portfolio on Meta and Google (or TikTok) read as one story under its "By platform" rows (P6
// view 9): one stacked bar of the spend shares, the spend summed in the portfolio's one
// currency, no blended cost per result, and the cross-platform move slot. G27 proposes moves
// between platforms but nothing calls it yet (P7), so the slot says no move is proposed instead
// of staying silent.

import { formatCurrency } from '../../format';
import { platformColor } from '../platforms/PlatformChip';
import { noBlendNote, type PlatformRow, spendShareLabel } from './byPlatformModel';

export function MixedPortfolioStory({
  rows,
  totalSpend,
  currency,
  resultKind,
  sourceIsNotPlatform,
}: {
  rows: readonly PlatformRow[];
  totalSpend: number;
  currency: string | null;
  resultKind: string;
  sourceIsNotPlatform: boolean;
}) {
  return (
    <div className="mt-3 space-y-2" data-testid="mixed-portfolio-story">
      <div
        aria-label={spendShareLabel(rows)}
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        data-testid="mixed-spend-bar"
        role="img"
      >
        {rows.map((row) =>
          row.spendShare ? (
            <span
              className={platformColor(row.platform).dot}
              data-platform={row.platform}
              key={row.platform}
              style={{ width: `${row.spendShare * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <p className="text-muted-foreground text-xs" data-testid="mixed-spend-total">
        <span className="font-semibold text-foreground tabular-nums">
          {formatCurrency(totalSpend, currency)}
        </span>{' '}
        spent across {rows.length} platforms. {noBlendNote(sourceIsNotPlatform, resultKind)}
      </p>
      <p className="text-muted-foreground text-xs" data-testid="cross-platform-move">
        <span className="font-medium text-foreground">Move between platforms:</span> no move
        proposed. The Optimizer doesn't propose moves between platforms yet; when it does, the move
        comes as a card in Actions.
      </p>
    </div>
  );
}
