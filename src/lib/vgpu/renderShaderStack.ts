import type { ShaderEffectV1, ShaderStackV1 } from '@continuum/contracts';

import shaderStackSource from './shader-stack.wgsl' with { type: 'text' };

type VgpuModule = typeof import('vgpu');
type Vgpu = Awaited<ReturnType<VgpuModule['init']>>;
type Texture = ReturnType<Vgpu['device']['createTexture']>;
type Target = ReturnType<VgpuModule['target']>;
type Surface = ReturnType<VgpuModule['surface']>;
type Effect = ReturnType<VgpuModule['effect']>;

interface Renderer {
  api: VgpuModule;
  gpu: Vgpu;
  input: Texture;
  targets: [Target, Target];
  outputCanvas: OffscreenCanvas;
  output: Surface;
  shader: Effect;
  sampler: GPUSampler;
  width: number;
  height: number;
  asyncError?: unknown;
}

export interface RenderShaderStackFrameOptions {
  source: CanvasImageSource;
  width: number;
  height: number;
  stack: ShaderStackV1;
  /** Seconds on the source timeline, used by effect keyframes and temporal noise. */
  timeSec?: number;
}

const EFFECT_KIND: Record<ShaderEffectV1['effectId'], number> = {
  chroma_key: 1,
  tint: 2,
  vignette: 3,
  film_grain: 4,
  pixelate: 5,
  chromatic_aberration: 6,
  vhs: 7,
};

let rendererPromise: Promise<Renderer> | undefined;
let renderTail: Promise<void> = Promise.resolve();

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function cubicBezier(
  progress: number,
  easing: NonNullable<ShaderEffectV1['keyframes'][number]['easing']>,
): number {
  const curve = (t: number, p1: number, p2: number) => {
    const inverse = 1 - t;
    return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
  };
  let low = 0;
  let high = 1;
  for (let index = 0; index < 12; index += 1) {
    const middle = (low + high) / 2;
    if (curve(middle, easing.x1, easing.x2) < progress) low = middle;
    else high = middle;
  }
  return curve((low + high) / 2, easing.y1, easing.y2);
}

export function resolveShaderParameter(
  effect: ShaderEffectV1,
  parameterName: ShaderEffectV1['keyframes'][number]['parameterName'],
  timeSec: number,
): number | string | undefined {
  const initial = effect.parameters[parameterName];
  const keyframes = effect.keyframes
    .filter((keyframe) => keyframe.parameterName === parameterName)
    .toSorted((left, right) => left.timeSec - right.timeSec);
  if (keyframes.length === 0) return initial;
  if (timeSec <= keyframes[0].timeSec) return keyframes[0].value;
  const last = keyframes.at(-1);
  if (!last || timeSec >= last.timeSec) return last?.value ?? initial;
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.timeSec >= timeSec);
  const left = keyframes[rightIndex - 1];
  const right = keyframes[rightIndex];
  if (!left || !right || left.interpolation === 'hold') return left?.value ?? initial;
  const span = right.timeSec - left.timeSec;
  let progress = span > 0 ? clamp01((timeSec - left.timeSec) / span) : 1;
  if (left.interpolation === 'bezier' && left.easing) progress = cubicBezier(progress, left.easing);
  return left.value + (right.value - left.value) * progress;
}

function rgba(hex: string | undefined): [number, number, number] {
  const valid = /^#[\da-f]{6}$/i.test(hex ?? '') ? (hex as string) : '#000000';
  return [1, 3, 5].map((offset) => Number.parseInt(valid.slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function uniformsFor(effect: ShaderEffectV1, width: number, height: number, timeSec: number) {
  const amount = Number(resolveShaderParameter(effect, 'amount', timeSec) ?? 0);
  const color = rgba(effect.parameters.color);
  if (effect.effectId === 'chroma_key') {
    return {
      size: [width, height],
      time: timeSec,
      kind: EFFECT_KIND[effect.effectId],
      primary: [...color, Number(resolveShaderParameter(effect, 'tolerance', timeSec) ?? 0)],
      secondary: [Number(resolveShaderParameter(effect, 'softness', timeSec) ?? 0), 0, 0, 0],
    };
  }
  if (effect.effectId === 'tint') {
    return {
      size: [width, height],
      time: timeSec,
      kind: EFFECT_KIND[effect.effectId],
      primary: [...color, amount],
      secondary: [0, 0, 0, 0],
    };
  }
  return {
    size: [width, height],
    time: timeSec,
    kind: EFFECT_KIND[effect.effectId],
    primary: [
      effect.effectId === 'pixelate'
        ? Number(resolveShaderParameter(effect, 'blockPx', timeSec) ?? 2)
        : amount,
      0,
      0,
      0,
    ],
    secondary: [0, 0, 0, 0],
  };
}

async function createRenderer(width: number, height: number): Promise<Renderer> {
  if (typeof OffscreenCanvas === 'undefined' || !globalThis.navigator?.gpu) {
    throw new Error('Shader rendering requires WebGPU, but this browser does not provide it.');
  }
  const api = await import('vgpu');
  const gpu = await api.init();
  const input = gpu.device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    // WebGPU requires RENDER_ATTACHMENT on copyExternalImageToTexture destinations.
    usage: ['copy_dst', 'texture_binding', 'render_attachment'],
    label: 'continuum.shader.input',
  });
  const targets: [Target, Target] = [
    api.target(gpu, { size: [width, height], format: 'rgba8unorm', label: 'continuum.shader.a' }),
    api.target(gpu, { size: [width, height], format: 'rgba8unorm', label: 'continuum.shader.b' }),
  ];
  const outputCanvas = new OffscreenCanvas(width, height);
  const output = api.surface(gpu, outputCanvas, {
    autoResize: false,
    size: [width, height],
    alphaMode: 'premultiplied',
    label: 'continuum.shader.output',
  });
  const sampler = api.sampler(gpu, {
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  const shader = api.effect(gpu, shaderStackSource, {
    label: 'continuum.shader-stack',
    set: {
      src: input,
      srcSampler: sampler,
      params: {
        size: [width, height],
        time: 0,
        kind: 0,
        primary: [0, 0, 0, 0],
        secondary: [0, 0, 0, 0],
      },
    },
  });
  const renderer: Renderer = {
    api,
    gpu,
    input,
    targets,
    outputCanvas,
    output,
    shader,
    sampler,
    width,
    height,
  };
  gpu.onError((error) => {
    renderer.asyncError = error;
  });
  await Promise.all([
    shader.compile(targets[0]),
    shader.compile({ colors: [output.format], sampleCount: output.sampleCount }),
  ]);
  return renderer;
}

async function acquireRenderer(width: number, height: number): Promise<Renderer> {
  rendererPromise ??= createRenderer(width, height);
  let renderer = await rendererPromise;
  if (renderer.width !== width || renderer.height !== height) {
    // A resized native texture keeps the same wrapper identity. vgpu's reflected
    // resource cache therefore keeps the old bind group, which made the first size
    // correct and every later size a passthrough. Rebuild only on a resolution class
    // change; all frames at that size still reuse one prewarmed device/resource set.
    renderer.output.dispose();
    renderer.gpu.dispose();
    rendererPromise = createRenderer(width, height);
    renderer = await rendererPromise;
  }
  return renderer;
}

async function render(options: RenderShaderStackFrameOptions): Promise<ImageBitmap> {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const enabled = options.stack.effects.filter((effect) => effect.enabled);
  if (enabled.length === 0) return createImageBitmap(options.source);
  const renderer = await acquireRenderer(width, height);
  renderer.asyncError = undefined;
  renderer.gpu.gpu.queue.copyExternalImageToTexture(
    { source: options.source as GPUCopyExternalImageSource },
    { texture: renderer.input.gpu },
    [width, height],
  );

  let source: Texture | Target['color'] = renderer.input;
  for (const [index, effect] of enabled.entries()) {
    const final = index === enabled.length - 1;
    const target = final ? renderer.output : renderer.targets[index % 2];
    renderer.shader.set({
      src: source,
      srcSampler: renderer.sampler,
      params: uniformsFor(effect, width, height, options.timeSec ?? 0),
    });
    if (final) {
      renderer.api.frame(renderer.gpu, (currentFrame) =>
        currentFrame.pass(renderer.output, renderer.shader),
      );
    } else {
      renderer.shader.draw(target);
    }
    if (!final) source = target.color;
  }

  await renderer.gpu.gpu.queue.onSubmittedWorkDone();
  await renderer.gpu.settled();
  if (renderer.asyncError) {
    const detail =
      renderer.asyncError instanceof Error
        ? renderer.asyncError.message
        : String(renderer.asyncError);
    throw new Error(`WebGPU shader rendering failed: ${detail}`);
  }
  // `transferToImageBitmap()` resets a WebGPU OffscreenCanvas and produced a
  // valid-sized but all-black bitmap in Chromium's worker path. Snapshot only after
  // the queued GPU work has completed.
  return createImageBitmap(renderer.outputCanvas);
}

/**
 * Render one CanvasImageSource through the curated stack without a CPU readback.
 * Calls serialize over a single prewarmed device and reusable input/ping-pong resources.
 */
export function renderShaderStackFrame(
  options: RenderShaderStackFrameOptions,
): Promise<ImageBitmap> {
  const result = renderTail.then(() => render(options));
  renderTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Initialize the shared WebGPU device and compile both target signatures off the hot path. */
export async function prewarmShaderStackRenderer(width = 2, height = 2): Promise<void> {
  await acquireRenderer(width, height);
}
