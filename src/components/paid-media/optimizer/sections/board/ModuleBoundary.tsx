'use client';

// One module that throws while drawing costs that module, never the board: the frame stays at its
// size and says it could not be drawn (data-module-state="error", which the board's bench reads).
// The error itself goes to the console with the module's id.

import type { AdAccountBoardSlot } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ModuleFrame } from './ModuleFrame';

type Props = { slot: AdAccountBoardSlot; title: string; children: ReactNode };
type State = { failed: boolean };

export class ModuleBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[board] module ${this.props.slot.module} could not be drawn`, error, info);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { slot, title } = this.props;
    return (
      <ModuleFrame
        reason={slot.reason}
        size={slot.size}
        state="error"
        testId={`board-module-${slot.module}`}
        title={title}
      >
        <ModuleErrorText />
      </ModuleFrame>
    );
  }
}

function ModuleErrorText() {
  const uiText = useTranslations('scale');
  return (
    <p className="text-muted-foreground text-xs">
      {uiText('this_view_could_not_be_drawn_c1f055e')}
    </p>
  );
}
