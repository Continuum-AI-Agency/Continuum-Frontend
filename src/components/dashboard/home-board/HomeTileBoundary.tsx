'use client';

// One tile that throws while drawing costs that tile, never the Home: the frame stays at its size
// and says it could not be drawn (data-module-state="error", which the board's bench reads).
import { HOME_TILE_LABELS, type HomeBoardTile } from '@continuum/contracts';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ModuleFrame } from '@/components/paid-media/optimizer/sections/board/ModuleFrame';

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
    const { tile } = this.props;
    return (
      <ModuleFrame
        reason={tile.why ?? undefined}
        size={tile.size}
        state="error"
        testId={`home-tile-${tile.id}`}
        title={HOME_TILE_LABELS[tile.id]}
      >
        <p className="text-muted-foreground text-xs">This tile could not be drawn.</p>
      </ModuleFrame>
    );
  }
}
