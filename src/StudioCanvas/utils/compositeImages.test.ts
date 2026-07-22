import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { compositeImages } from './compositeImages';

// Mock canvas context
const mockCtx = {
  drawImage: mock(() => {}),
};

// Mock canvas element
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: mock(() => mockCtx),
  toDataURL: mock(() => 'data:image/png;base64,composited_result'),
};

// Store original document.createElement
const originalCreateElement = document.createElement.bind(document);

describe('compositeImages', () => {
  beforeEach(() => {
    mockCtx.drawImage.mockClear();
    mockCanvas.getContext.mockClear();
    mockCanvas.toDataURL.mockClear();
    mockCanvas.width = 0;
    mockCanvas.height = 0;

    // Mock document.createElement to return our mock canvas
    document.createElement = mock((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    // Mock Image constructor
    (globalThis as any).Image = class MockImage {
      width = 100;
      height = 100;
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    };
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it('should composite base and overlay images', async () => {
    const baseDataUrl = 'data:image/png;base64,base_image_data';
    const overlayDataUrl = 'data:image/png;base64,overlay_image_data';

    const result = await compositeImages(baseDataUrl, overlayDataUrl);

    expect(result.dataUrl).toBe('data:image/png;base64,composited_result');
    expect(result.base64).toBe('composited_result');
    expect(result.mimeType).toBe('image/png');
  });

  it('should set canvas dimensions to match base image', async () => {
    const baseDataUrl = 'data:image/png;base64,base_image_data';
    const overlayDataUrl = 'data:image/png;base64,overlay_image_data';

    await compositeImages(baseDataUrl, overlayDataUrl);

    expect(mockCanvas.width).toBe(100);
    expect(mockCanvas.height).toBe(100);
  });

  it('should draw base image first, then overlay', async () => {
    const baseDataUrl = 'data:image/png;base64,base_image_data';
    const overlayDataUrl = 'data:image/png;base64,overlay_image_data';

    await compositeImages(baseDataUrl, overlayDataUrl);

    expect(mockCtx.drawImage).toHaveBeenCalledTimes(2);
  });

  it('should request 2d context from canvas', async () => {
    const baseDataUrl = 'data:image/png;base64,base_image_data';
    const overlayDataUrl = 'data:image/png;base64,overlay_image_data';

    await compositeImages(baseDataUrl, overlayDataUrl);

    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
  });

  it('should throw error when canvas context is unavailable', async () => {
    const originalGetContext = mockCanvas.getContext;
    mockCanvas.getContext = mock(() => null);

    const baseDataUrl = 'data:image/png;base64,base_image_data';
    const overlayDataUrl = 'data:image/png;base64,overlay_image_data';

    await expect(compositeImages(baseDataUrl, overlayDataUrl)).rejects.toThrow(
      'Failed to get canvas 2D context',
    );

    // Restore for subsequent tests
    mockCanvas.getContext = originalGetContext;
  });

  it('should throw error when base image fails to load', async () => {
    (globalThis as any).Image = class MockImage {
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        setTimeout(() => {
          if (this.onerror) this.onerror();
        }, 0);
      }
    };

    const baseDataUrl = 'data:image/png;base64,invalid_base';
    const overlayDataUrl = 'data:image/png;base64,overlay_image_data';

    await expect(compositeImages(baseDataUrl, overlayDataUrl)).rejects.toThrow(
      'Failed to load image',
    );
  });

  it('should output PNG format', async () => {
    const baseDataUrl = 'data:image/jpeg;base64,jpeg_base';
    const overlayDataUrl = 'data:image/png;base64,overlay';

    await compositeImages(baseDataUrl, overlayDataUrl);

    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });
});
