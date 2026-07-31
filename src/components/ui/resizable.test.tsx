import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelCollapseButton,
  ResizablePanelGroup,
} from './resizable';

afterEach(() => cleanup());

function renderSplit(onCollapse: () => void) {
  return render(
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="main">main</ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="side">
        <div className="relative flex">
          side
          <ResizablePanelCollapseButton
            label="Collapse side panel"
            data-testid="side-collapse"
            onClick={onCollapse}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>,
  );
}

describe('ResizablePanelCollapseButton', () => {
  // The whole point of the component: a collapse button nested in the separator is inside
  // react-resizable-panels' drag capture, so pressing it starts a resize. Living in the
  // panel keeps the press its own.
  it('is not a descendant of the resize handle', () => {
    const { container, getByTestId } = renderSplit(mock());

    const handle = container.querySelector('[data-slot="resizable-handle"]');
    const button = getByTestId('side-collapse');

    expect(handle).not.toBeNull();
    expect(handle?.contains(button)).toBe(false);
  });

  it('collapses on a plain click — no forced click needed', () => {
    const onCollapse = mock();
    const { getByLabelText } = renderSplit(onCollapse);

    fireEvent.click(getByLabelText('Collapse side panel'));

    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('leaves the separator alone: a press on the button never reaches it', () => {
    const { container, getByTestId } = renderSplit(mock());

    const handle = container.querySelector('[data-slot="resizable-handle"]');
    const separatorPressed = mock();
    handle?.addEventListener('pointerdown', separatorPressed);

    fireEvent.pointerDown(getByTestId('side-collapse'));

    expect(separatorPressed).not.toHaveBeenCalled();
  });
});

describe('ResizableHandle', () => {
  it('renders the grip only when asked', () => {
    const withGrip = render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="a">a</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="b">b</ResizablePanel>
      </ResizablePanelGroup>,
    );
    expect(withGrip.container.querySelector('[data-slot="resizable-handle"] > div')).not.toBeNull();
    cleanup();

    const bare = render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="a">a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="b">b</ResizablePanel>
      </ResizablePanelGroup>,
    );
    expect(bare.container.querySelector('[data-slot="resizable-handle"] > div')).toBeNull();
  });
});
