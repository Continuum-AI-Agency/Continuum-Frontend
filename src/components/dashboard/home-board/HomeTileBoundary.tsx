'use client';

// One tile that throws while drawing costs that tile, never the Home: the frame stays at its size
// and says it could not be drawn (data-module-state="error", which the board's bench reads).
import type { HomeBoardTile } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ModuleFrame } from '@/components/paid-media/optimizer/sections/board/ModuleFrame';
import { useHomeTileTitle } from './HomeTileFrame';

type Props = { tile: HomeBoardTile; children: ReactNode };
type State = { failed: boolean };

export class HomeTileBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[home] tile ${this.props.tile.id} could not be drawn`, error, info);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <FailedTile tile={this.props.tile} />;
  }
}

function FailedTile({ tile }: { tile: HomeBoardTile }) {
  const uiText = useTranslations('dashboard');
  return (
    <ModuleFrame
      reason={tile.why ?? undefined}
      size={tile.size}
      state="error"
      testId={`home-tile-${tile.id}`}
      title={useHomeTileTitle(tile.id)}
    >
      <p className="text-muted-foreground text-xs">
        {uiText('this_tile_could_not_be_drawn_89d245d')}
      </p>
    </ModuleFrame>
  );
}
