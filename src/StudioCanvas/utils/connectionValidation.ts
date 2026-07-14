// Canonical single-text-input guards live in @continuum/contracts
// (ai-studio/workflow-graph) so the Backend MCP tool and this canvas enforce
// the exact same rules — no drift. This module re-exports it so existing
// `./connectionValidation` imports keep resolving.

export {
  canAcceptSingleTextInput,
  hasExistingTargetConnection,
  isTextInputHandle,
} from '@continuum/contracts';
