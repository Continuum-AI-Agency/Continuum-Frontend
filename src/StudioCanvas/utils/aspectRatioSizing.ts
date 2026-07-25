// Node geometry lives in @continuum/contracts (ai-studio/node-sizing): the agent
// write path sizes a node exactly the way the browser does, so there is one
// implementation and not two that drift. This module stays as the canvas's import
// site so every node component keeps its short relative import.
export {
  type GeneratorNodeBounds,
  generatorNodeStyle,
  getAspectRatioValue,
  IMAGE_GENERATOR_NODE_BOUNDS,
  type NodeDimensions,
  OMNI_GENERATOR_NODE_BOUNDS,
  simplifyAspectRatio,
  snapNodeDimensionsToAspectRatio,
  VIDEO_GENERATOR_NODE_BOUNDS,
} from '@continuum/contracts';
