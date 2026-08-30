import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { clearVideoAspectCache } from '../hooks/useSnapToVideoAspect';
import { useStudioStore } from '../stores/useStudioStore';
import { VideoReferenceNode } from './VideoReferenceNode';

const updateNodeData = mock();
const updateNode = mock();
const triggerSave = mock();
let originalUpdateNodeData: any;
let originalUpdateNode: any;
let originalTriggerSave: any;

describe('VideoReferenceNode', () => {
  beforeEach(() => {
    // The video aspect probe is memoized across the module; a stale entry from another
    // suite would answer instantly and this file's detached-element assertions never fire.
    clearVideoAspectCache();
    originalUpdateNodeData = useStudioStore.getState().updateNodeData;
    originalUpdateNode = useStudioStore.getState().updateNode;
    originalTriggerSave = useStudioStore.getState().triggerSave;
    useStudioStore.setState({
      nodes: [],
      edges: [],
      updateNodeData,
      updateNode,
      triggerSave,
    });
    updateNodeData.mockClear();
    updateNode.mockClear();
    triggerSave.mockClear();
  });

  afterEach(() => {
    if (originalUpdateNodeData) {
      useStudioStore.setState({ updateNodeData: originalUpdateNodeData });
    }
    if (originalUpdateNode) {
      useStudioStore.setState({ updateNode: originalUpdateNode });
    }
    if (originalTriggerSave) {
      useStudioStore.setState({ triggerSave: originalTriggerSave });
    }
    cleanup();
  });

  const defaultProps = {
    id: '1',
    data: {
      video: undefined,
      fileName: undefined,
    },
    type: 'video',
    selected: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: '',
  };

  it('should render correctly', async () => {
    let renderResult: ReturnType<typeof render> | undefined;
    await act(async () => {
      renderResult = render(
        <ToastProvider>
          <ReactFlowProvider>
            <VideoReferenceNode {...defaultProps} />
          </ReactFlowProvider>
        </ToastProvider>,
      );
    });

    expect(screen.getByText('Upload Video')).toBeTruthy();
  });

  it('should accept dropped video data URLs', async () => {
    const dataUrl = 'data:video/mp4;base64,drop_video_base64';
    let renderResult: ReturnType<typeof render> | undefined;
    await act(async () => {
      renderResult = render(
        <ToastProvider>
          <ReactFlowProvider>
            <VideoReferenceNode {...defaultProps} />
          </ReactFlowProvider>
        </ToastProvider>,
      );
    });
    if (!renderResult) throw new Error('Render failed');
    const { container } = renderResult;

    const dropTarget = container.querySelector('div.relative.group') as HTMLElement;
    const dataTransfer = {
      getData: (type: string) => (type === 'text/plain' ? dataUrl : ''),
      files: [],
      types: ['text/plain'],
      dropEffect: 'copy',
    };

    await act(async () => {
      fireEvent.dragOver(dropTarget, { dataTransfer });
      fireEvent.drop(dropTarget, { dataTransfer });
    });

    await waitFor(() => {
      expect(updateNodeData).toHaveBeenCalledWith('1', {
        video: dataUrl,
        fileName: undefined,
        sourcePath: undefined,
        sourceUrl: undefined,
      });
      expect(triggerSave).toHaveBeenCalled();
    });
  });

  it('detects the real video aspect ratio and resizes the node to match', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const createdVideoElements: HTMLVideoElement[] = [];
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === 'video') {
        createdVideoElements.push(element as HTMLVideoElement);
      }
      return element;
    }) as typeof document.createElement;

    try {
      let renderResult: ReturnType<typeof render> | undefined;
      await act(async () => {
        renderResult = render(
          <ToastProvider>
            <ReactFlowProvider>
              <VideoReferenceNode
                {...defaultProps}
                data={{ video: 'https://example.com/portrait-reel.mp4', fileName: 'reel.mp4' }}
              />
            </ReactFlowProvider>
          </ToastProvider>,
        );
      });
      if (!renderResult) throw new Error('Render failed');
      const { container } = renderResult;

      // Measured from the element ALREADY showing the clip. A second, detached element
      // downloaded the same bytes twice, both requests issued in the same instant under
      // the same token, so neither could use the other's cache entry.
      const detectionVideo = container.querySelector('video');
      if (!detectionVideo) throw new Error('the node rendered no video to measure');
      expect(createdVideoElements.filter((video) => video !== detectionVideo)).toHaveLength(0);

      Object.defineProperty(detectionVideo, 'videoWidth', { configurable: true, value: 1080 });
      Object.defineProperty(detectionVideo, 'videoHeight', { configurable: true, value: 1920 });

      await act(async () => {
        fireEvent.loadedMetadata(detectionVideo);
      });

      await waitFor(() => {
        expect(updateNode).toHaveBeenCalledWith('1', expect.any(Function));
      });

      const updater = updateNode.mock.calls[updateNode.mock.calls.length - 1][1];
      const nextNode = updater({ id: '1', data: {}, style: { width: 192, height: 192 } });
      expect(nextNode.data.aspectRatio).toBe('9:16');
      expect(nextNode.style.width / nextNode.style.height).toBeCloseTo(9 / 16, 1);
    } finally {
      document.createElement = originalCreateElement;
    }
  });
});
