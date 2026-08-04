import { registerClientRenderExecutor } from './executorRegistry';
import { executeHyperframesClientRender } from './executors/hyperframes';
import { executeMcpClipBatchClientRender } from './executors/mcpClipBatch';
import { executeOrganicHyperframeClientRender } from './executors/organicHyperframe';
import { executePlannerReelClientRender } from './executors/plannerReel';
import { executeTimelineEditorClientRender } from './executors/timelineEditor';

let registered = false;

export function registerDefaultClientRenderExecutors(): void {
  if (registered) return;
  registered = true;
  registerClientRenderExecutor('hyperframes_agent', executeHyperframesClientRender);
  registerClientRenderExecutor('mcp_clip_batch', executeMcpClipBatchClientRender);
  registerClientRenderExecutor('organic_hyperframe', executeOrganicHyperframeClientRender);
  registerClientRenderExecutor('planner_reel', executePlannerReelClientRender);
  registerClientRenderExecutor('timeline_editor', executeTimelineEditorClientRender);
}
