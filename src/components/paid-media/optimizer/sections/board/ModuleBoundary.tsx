'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// One module that throws while drawing costs that module, never the board: the frame stays at its
// size and says it could not be drawn (data-module-state="error", which the board's bench reads).
// The error itself goes to the console with the module's id.

import type { AdAccountBoardSlot } from '@continuum/contracts';
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
    return <ModuleFailure slot={slot} title={title} />;
  }
}

function ModuleFailure({ slot, title }: Pick<Props, 'slot' | 'title'>) {
  const betaUiText = useBetaTranslations('scale');
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      state="error"
      testId={`board-module-${slot.module}`}
      title={title}
    >
      <p className="text-muted-foreground text-xs">{betaUiText('beta_c1f055ecd99c')}</p>
    </ModuleFrame>
  );
}
