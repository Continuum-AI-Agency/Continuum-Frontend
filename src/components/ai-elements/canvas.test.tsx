import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';

let receivedProps: Record<string, unknown> = {};

mock.module('@xyflow/react', () => ({
  ReactFlow: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
    receivedProps = props;
    return <div>{children}</div>;
  },
  Background: () => <div data-testid="canvas-background" />,
}));

import { Canvas } from './canvas';

afterEach(() => {
  cleanup();
  receivedProps = {};
});

describe('Canvas', () => {
  it('uses the supported React Flow option to hide attribution', () => {
    render(<Canvas proOptions={{ hideAttribution: false }} />);

    expect(receivedProps.proOptions).toEqual({ hideAttribution: true });
  });
});
