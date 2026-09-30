import { registerLazyClientRenderExecutor } from './executorRegistry';

let registered = false;

export function registerDefaultClientRenderExecutors(): void {
  if (registered) return;
  registered = true;
  registerLazyClientRenderExecutor('creative_ops', () =>
    import('./executors/creativeOps').then((m) => m.executeCreativeOpsClientRender),
  );
  registerLazyClientRenderExecutor('mcp_clip_batch', () =>
    import('./executors/mcpClipBatch').then((m) => m.executeMcpClipBatchClientRender),
  );
  registerLazyClientRenderExecutor('planner_reel', () =>
    import('./executors/plannerReel').then((m) => m.executePlannerReelClientRender),
  );
  registerLazyClientRenderExecutor('timeline_editor', () =>
    import('./executors/timelineEditor').then((m) => m.executeTimelineEditorClientRender),
  );
}
