// Canvas connection-validity matrix. The canonical implementation lives in
// @continuum/contracts (ai-studio/workflow-graph) so the Backend MCP tool that
// builds workflows and this canvas enforce the exact same rules — no drift. This
// module re-exports it so existing `./isValidConnection` imports keep resolving;
// the xyflow Connection/Edge/StudioNode types structurally satisfy the contract
// signatures, so no adapter is needed.

export {
  isValidConnection,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  getTargetHandleConnectionLimit,
  isClipSlotHandle,
} from "@continuum/contracts";
