'use client';

// One chat message that throws while drawing costs that message, never the conversation. The
// route's error boundary used to catch it and replace the whole page — composer, history and the
// run still streaming behind it — with "Something went wrong", and its "Try again" remounted the
// panel from history. Here the row says it could not be shown, and showing it again re-renders it
// from the same state. A DOM error React hits while committing the row (Chrome's page translation
// rewriting nodes it holds, facebook/react#11538) lands here too.

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { messageId: string; children: ReactNode };
type State = { failed: boolean };

export class MessageRowBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[organic] message ${this.props.messageId} could not be drawn`, error, info);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        translate="no"
        data-message-row-state="error"
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
      >
        <span className="min-w-0 text-sm text-muted-foreground">
          This message could not be displayed.
        </span>
        <button
          type="button"
          className="shrink-0 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => this.setState({ failed: false })}
        >
          Show again
        </button>
      </div>
    );
  }
}
