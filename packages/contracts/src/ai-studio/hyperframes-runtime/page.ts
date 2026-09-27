import { shaderStackV1Schema } from '../shader-stack';
import { audioElements, seekComposition, videoSourceTime } from './composition';
import { applyShaderStack } from './renderShaderStack';
import { buildTemporalMetrics, canvasLuma, measureLayout, motionStrip, reviewPlan } from './review';

/**
 * The runtime as one classic page script — the entry Continuum Render bundles and loads
 * into its headless Chrome, so the server renders with the browser's own functions.
 */
Object.assign(globalThis, {
  __hyperframesRuntime: {
    applyShaderStack,
    audioElements,
    buildTemporalMetrics,
    canvasLuma,
    measureLayout,
    motionStrip,
    reviewPlan,
    seekComposition,
    shaderStackV1Schema,
    videoSourceTime,
  },
});
