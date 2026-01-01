import { describe, it, expect } from "bun:test";

import {
  getPortColor,
  arePortsCompatible,
  getTargetPortType,
  getNodeOutputPortType,
} from "@/lib/ai-studio/portTypes";
import type { StudioNode } from "@/lib/ai-studio/nodeTypes";

describe("getPortColor", () => {
  it("returns blue for text type", () => {
    expect(getPortColor('text')).toBe('#3b82f6');
  });

  it("returns purple for image type", () => {
    expect(getPortColor('image')).toBe('#a855f7');
  });

  it("returns purple for video type", () => {
    expect(getPortColor('video')).toBe('#a855f7');
  });

  it("returns green for aspect type", () => {
    expect(getPortColor('aspect')).toBe('#22c55e');
  });

  it("returns amber for provider type", () => {
    expect(getPortColor('provider')).toBe('#f59e0b');
  });
});

describe("arePortsCompatible", () => {
  it("allows text to prompt connection", () => {
    expect(arePortsCompatible('text', 'prompt')).toBe(true);
  });

  it("allows text to negative connection", () => {
    expect(arePortsCompatible('text', 'negative')).toBe(true);
  });

  it("blocks text to ref connection", () => {
    expect(arePortsCompatible('text', 'ref')).toBe(false);
  });

  it("allows image to ref connection", () => {
    expect(arePortsCompatible('image', 'ref')).toBe(true);
  });

  it("allows image to firstFrame connection", () => {
    expect(arePortsCompatible('image', 'firstFrame')).toBe(true);
  });

  it("allows image to lastFrame connection", () => {
    expect(arePortsCompatible('image', 'lastFrame')).toBe(true);
  });

  it("blocks image to prompt connection", () => {
    expect(arePortsCompatible('image', 'prompt')).toBe(false);
  });

  it("allows video to referenceVideo connection", () => {
    expect(arePortsCompatible('video', 'referenceVideo')).toBe(true);
  });

  it("blocks video to ref connection", () => {
    expect(arePortsCompatible('video', 'ref')).toBe(false);
  });

  it("allows aspect to aspect connection", () => {
    expect(arePortsCompatible('aspect', 'aspect')).toBe(true);
  });

  it("blocks aspect to provider connection", () => {
    expect(arePortsCompatible('aspect', 'provider')).toBe(false);
  });

  it("allows provider to provider connection", () => {
    expect(arePortsCompatible('provider', 'provider')).toBe(true);
  });

  it("blocks provider to aspect connection", () => {
    expect(arePortsCompatible('provider', 'aspect')).toBe(false);
  });
});

describe("getTargetPortType", () => {
  it("returns text for prompt handle", () => {
    expect(getTargetPortType('prompt')).toBe('text');
  });

  it("returns text for negative handle", () => {
    expect(getTargetPortType('negative')).toBe('text');
  });

  it("returns image for ref handle", () => {
    expect(getTargetPortType('ref')).toBe('image');
  });

  it("returns image for firstFrame handle", () => {
    expect(getTargetPortType('firstFrame')).toBe('image');
  });

  it("returns image for lastFrame handle", () => {
    expect(getTargetPortType('lastFrame')).toBe('image');
  });

  it("returns video for referenceVideo handle", () => {
    expect(getTargetPortType('referenceVideo')).toBe('video');
  });

  it("returns aspect for aspect handle", () => {
    expect(getTargetPortType('aspect')).toBe('aspect');
  });

  it("returns provider for provider handle", () => {
    expect(getTargetPortType('provider')).toBe('provider');
  });

  it("returns undefined for unknown handle", () => {
    expect(getTargetPortType('unknown')).toBeUndefined();
  });

  it("returns undefined for undefined handle", () => {
    expect(getTargetPortType(undefined)).toBeUndefined();
  });
});

describe("getNodeOutputPortType", () => {
  it("returns text for prompt node", () => {
    const node: StudioNode = {
      id: '1',
      type: 'prompt',
      position: { x: 0, y: 0 },
      data: { prompt: 'test' },
    };
    expect(getNodeOutputPortType(node)).toBe('text');
  });

  it("returns text for negative node", () => {
    const node: StudioNode = {
      id: '1',
      type: 'negative',
      position: { x: 0, y: 0 },
      data: { negativePrompt: 'test' },
    };
    expect(getNodeOutputPortType(node)).toBe('text');
  });

  it("returns image for attachment node with image MIME", () => {
    const node: StudioNode = {
      id: '1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'test', path: '/test.png', mimeType: 'image/png', previewUrl: 'url' },
    };
    expect(getNodeOutputPortType(node)).toBe('image');
  });

  it("returns video for attachment node with video MIME", () => {
    const node: StudioNode = {
      id: '1',
      type: 'attachment',
      position: { x: 0, y: 0 },
      data: { label: 'test', path: '/test.mp4', mimeType: 'video/mp4', previewUrl: 'url' },
    };
    expect(getNodeOutputPortType(node)).toBe('video');
  });

  it("returns provider for model node", () => {
    const node: StudioNode = {
      id: '1',
      type: 'model',
      position: { x: 0, y: 0 },
      data: { provider: 'nano-banana', medium: 'image', aspectRatio: '1:1' },
    };
    expect(getNodeOutputPortType(node)).toBe('provider');
  });

  it("returns image for generator node without outputType", () => {
    const node: StudioNode = {
      id: '1',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { provider: 'nano-banana', medium: 'image', prompt: '', aspectRatio: '1:1' },
    };
    expect(getNodeOutputPortType(node)).toBe('image');
  });

  it("returns video for generator node with video outputType", () => {
    const node: StudioNode = {
      id: '1',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { 
        provider: 'veo-3-1', 
        medium: 'video', 
        prompt: '', 
        aspectRatio: '16:9',
        outputType: 'video',
      },
    };
    expect(getNodeOutputPortType(node)).toBe('video');
  });

  it("returns undefined for preview node", () => {
    const node: StudioNode = {
      id: '1',
      type: 'preview',
      position: { x: 0, y: 0 },
      data: { artifactPreview: '', medium: 'image' },
    };
    expect(getNodeOutputPortType(node)).toBeUndefined();
  });
});
