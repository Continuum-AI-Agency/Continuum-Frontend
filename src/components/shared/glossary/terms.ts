// Static glossary — the single source of truth for plain-English definitions of
// the advanced concepts surfaced across Scale, Library, and Settings (IMP-018).
// Customer-language names + one-line definitions so terms like DCO, ROAS,
// HyperFrames, MCP, and percentile heatmaps never assume prior knowledge. This is
// intentionally a static catalog, NOT a translation/i18n foundation — new terms
// are added here, then wired with GlossaryTooltip where they appear.

export type GlossaryTermKey =
  | "dco"
  | "roas"
  | "hyperframes"
  | "mcp"
  | "percentile-heatmap"

export type GlossaryEntry = {
  term: string
  short: string
}

export const GLOSSARY_TERMS: Record<GlossaryTermKey, GlossaryEntry> = {
  dco: {
    term: "DCO",
    short:
      "Dynamic Creative Optimization — the ad platform automatically mixes your images, headlines, and copy to show each person the combination most likely to work.",
  },
  roas: {
    term: "ROAS",
    short:
      "Return On Ad Spend — the revenue earned for every $1 spent on ads. A ROAS of 4 means you made $4 back for every $1 spent.",
  },
  hyperframes: {
    term: "HyperFrames",
    short:
      "Motion-designed video frames rendered from your creative — animated, on-brand clips built automatically from a still layout.",
  },
  mcp: {
    term: "MCP",
    short:
      "Model Context Protocol — the open standard that lets apps like Claude securely connect to Continuum and run your marketing tools on your behalf.",
  },
  "percentile-heatmap": {
    term: "Percentile heatmap",
    short:
      "A colour grid that ranks each metric against the rest — deep colour marks top-percentile (best) performance, faint colour marks bottom-percentile.",
  },
}

export function glossaryEntry(key: GlossaryTermKey): GlossaryEntry {
  return GLOSSARY_TERMS[key]
}
