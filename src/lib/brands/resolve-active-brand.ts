// Canonical implementation lives in @continuum/contracts so the Backend MCP
// connector defaults to the exact same brand the web app would. Re-exported here
// to keep existing Frontend import paths stable.
export {
  resolveActiveBrandId,
  type ResolveActiveBrandInput,
  type ActiveBrandResolution,
} from "@continuum/contracts";
