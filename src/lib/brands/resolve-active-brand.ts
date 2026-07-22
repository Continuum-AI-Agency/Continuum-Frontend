// Canonical implementation lives in @continuum/contracts so the Backend MCP
// connector defaults to the exact same brand the web app would. Re-exported here
// to keep existing Frontend import paths stable.
export {
  type ActiveBrandResolution,
  type ResolveActiveBrandInput,
  resolveActiveBrandId,
} from '@continuum/contracts';
