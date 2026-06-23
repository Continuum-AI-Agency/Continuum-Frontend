import { z } from "zod";

import { httpUrlSchema } from "./_shared";
import { brandPaletteSchema, brandTypographySchema } from "./website-summary";
import { brandVoiceSchema } from "./brand-voice";
import { targetAudienceSchema } from "./target-audience";
import { brandStrategySchema } from "./brand-strategy";
import { brandGuidelinesSchema } from "./brand-guidelines";
import { READINESS_DIMENSIONS } from "./readiness";
import type { BrandProfile } from "./brand-profile";
import type { BrandReportResult } from "./brand-report";
import type { BrandDeep } from "./brand-deep";

// Canonical, agent-facing brand identity — the "brand.md" the whole app grounds
// on. It is a PROJECTION of the onboarding report (the same fields, flattened to
// the identity slice agents actually use — palette/typography/logo + voice +
// audience + positioning + strategy + guidelines), omitting run artifacts
// (audits, citations, readiness findings). One shape, one read path
// (`getBrandDna`), one prompt-block (`renderBrandDnaMarkdown`) — replacing the
// per-consumer hand-rolled brand-context assemblers that drift today.
export const brandDnaSchema = z.object({
  brand_id: z.string().nullable().optional(),
  brand_name: z.string().min(1),
  website_url: httpUrlSchema.nullable().optional(),
  logo_url: httpUrlSchema.nullable().optional(),
  palette: brandPaletteSchema.nullable().optional(),
  typography: brandTypographySchema.nullable().optional(),
  positioning_thesis: z.string().nullable().optional(),
  hypothesis_icp: z.string().nullable().optional(),
  brand_pillars: z.array(z.string()).default([]),
  tonal_signal: z.string().nullable().optional(),
  voice: brandVoiceSchema.nullable().optional(),
  audience: targetAudienceSchema.nullable().optional(),
  strategy: brandStrategySchema.nullable().optional(),
  guidelines: brandGuidelinesSchema.nullable().optional(),
});
export type BrandDna = z.infer<typeof brandDnaSchema>;

// BrandProfile is `.loose()`, so a signed logo URL may ride along as an extra
// key. We never surface the raw storage `logo_path` here — that is resolved to a
// signed URL by the read path (getBrandDna), not by this pure projection.
function extractLogoUrl(profile: BrandProfile): string | null {
  const candidate = (profile as Record<string, unknown>).logo_url;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : null;
}

export function toBrandDna(result: BrandReportResult): BrandDna {
  const { brand_profile, structured, understanding } = result;
  return brandDnaSchema.parse({
    brand_id: brand_profile.id ?? null,
    brand_name: brand_profile.brand_name,
    website_url: structured.website?.website_url ?? brand_profile.website_url ?? null,
    logo_url: extractLogoUrl(brand_profile),
    palette: structured.website?.palette ?? null,
    typography: structured.website?.typography ?? null,
    positioning_thesis: understanding.positioning_thesis,
    hypothesis_icp: understanding.hypothesis_icp,
    brand_pillars: understanding.brand_pillars,
    tonal_signal: understanding.tonal_signal,
    voice: brand_profile.brand_voice ?? null,
    audience: structured.target_audience ?? null,
    strategy: structured.strategy ?? null,
    guidelines: structured.guidelines ?? null,
  });
}

function pushSection(lines: string[], heading: string, body: string[]): void {
  if (body.length === 0) return;
  lines.push("", heading, ...body);
}

function mdTable(header: string[], rows: string[][]): string[] {
  const head = `| ${header.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  return [head, sep, ...rows.map((r) => `| ${r.join(" | ")} |`)];
}

// Sentinel a T2 section emits when its deep content has not landed yet. Exported
// so a structured consumer (the Brand Book viewer) can detect pending state
// without string-sniffing.
export const DEEP_PENDING_LABEL = "_Pending deep analysis._";

// A T2 sub-section always renders SOMETHING in the full bible: its content when
// the deep pass produced it, otherwise a pending stub — so the document shows
// the full structure with explicit "filling in later" markers.
function renderDeep(result: BrandReportResult | undefined, project: (deep: BrandDeep) => string[]): string[] {
  const deep = result?.deep ?? null;
  if (!deep) return [DEEP_PENDING_LABEL];
  const body = project(deep);
  return body.length > 0 ? body : [DEEP_PENDING_LABEL];
}

// ---------------------------------------------------------------------------
// Brand.md section registry — the SINGLE ordered source for both projections:
//   - renderBrandDnaMarkdown = the lean grounding block (includeInGrounding only)
//   - renderBrandBibleMarkdown = the full-fidelity Brand Book (every section + a
//     governance footer)
// Deriving both from one list keeps lean and full from drifting; adding a section
// is a single entry here. `render` returns body lines (empty => the section is
// omitted, except T2 sub-sections which render a pending stub in full mode).
// ---------------------------------------------------------------------------
export type BrandBibleTier = "T0" | "T1" | "T2";

export interface BrandBibleRenderContext {
  mode: "lean" | "full";
  dna: BrandDna;
  result?: BrandReportResult;
}

export interface BrandBibleSection {
  id: string;
  title: string;
  tier: BrandBibleTier;
  includeInGrounding: boolean;
  render: (ctx: BrandBibleRenderContext) => string[];
}

export const BRAND_BIBLE_SECTIONS: readonly BrandBibleSection[] = [
  {
    id: "positioning",
    title: "## Positioning",
    tier: "T0",
    includeInGrounding: true,
    render: ({ dna }) => {
      const out: string[] = [];
      if (dna.positioning_thesis) out.push(dna.positioning_thesis);
      if (dna.hypothesis_icp) out.push(`ICP: ${dna.hypothesis_icp}`);
      const p = dna.strategy?.positioning;
      if (p) {
        out.push(
          `For ${p.target_customer} in ${p.market_category}, the key differentiator is ${p.key_differentiator}. Reason to believe: ${p.reason_to_believe}.`,
        );
        if (p.statement) out.push(p.statement);
      }
      return out;
    },
  },
  {
    id: "brand_pillars",
    title: "## Brand pillars",
    tier: "T0",
    includeInGrounding: true,
    render: ({ dna }) =>
      dna.strategy?.message_pillars?.map((mp) => `- ${mp.pillar}: ${mp.description}`) ??
      dna.brand_pillars.map((name) => `- ${name}`),
  },
  {
    id: "voice",
    title: "## Voice",
    tier: "T0",
    includeInGrounding: true,
    render: ({ dna }) => {
      const out: string[] = [];
      if (dna.tonal_signal) out.push(`Tonal signal: ${dna.tonal_signal}`);
      if (dna.voice?.tone) out.push(`Tone: ${dna.voice.tone}`);
      if (dna.voice?.voice_style) out.push(`Style: ${dna.voice.voice_style}`);
      const vr = dna.guidelines?.voice_rules;
      if (vr && vr.dos.length > 0) out.push(`Do: ${vr.dos.join("; ")}`);
      if (vr && vr.donts.length > 0) out.push(`Don't: ${vr.donts.join("; ")}`);
      const banned =
        dna.guidelines?.messaging_guardrails.banned_words ?? dna.voice?.banned_words ?? [];
      if (banned.length > 0) out.push(`Banned words: ${banned.join(", ")}`);
      return out;
    },
  },
  {
    id: "audience",
    title: "## Audience",
    tier: "T0",
    includeInGrounding: true,
    render: ({ dna }) => (dna.audience?.summary ? [dna.audience.summary] : []),
  },
  {
    id: "promise",
    title: "## Promise",
    tier: "T0",
    includeInGrounding: true,
    render: ({ dna }) => {
      const out: string[] = [];
      if (dna.strategy?.promise.headline) out.push(dna.strategy.promise.headline);
      if (dna.strategy?.taglines.primary) out.push(`Tagline: ${dna.strategy.taglines.primary}`);
      return out;
    },
  },
  {
    id: "visual_identity",
    title: "## Visual identity",
    tier: "T0",
    includeInGrounding: true,
    render: ({ dna }) => {
      const out: string[] = [];
      if (dna.palette) {
        const colors = [dna.palette.primary, dna.palette.secondary, dna.palette.accent].filter(
          (c): c is string => Boolean(c),
        );
        if (colors.length > 0) out.push(`Palette: ${colors.join(", ")}`);
      }
      if (dna.typography?.primary || dna.typography?.secondary) {
        const fonts = [dna.typography.primary, dna.typography.secondary].filter((f): f is string =>
          Boolean(f),
        );
        out.push(`Typography: ${fonts.join(" / ")}`);
      }
      return out;
    },
  },
  // --- full-only (not injected into the lean grounding block) ---------------
  {
    id: "personas",
    title: "## Personas",
    tier: "T0",
    includeInGrounding: false,
    render: ({ dna }) => {
      const segments = dna.audience?.segments ?? [];
      if (!segments || segments.length === 0) return [];
      const out: string[] = [];
      for (const seg of segments) {
        out.push(`### ${seg.name}`);
        if (seg.jtbd) out.push(`JTBD: ${seg.jtbd}`);
        if (seg.pains_verbatim && seg.pains_verbatim.length > 0)
          out.push(`Pains: ${seg.pains_verbatim.join("; ")}`);
        if (seg.buying_criteria && seg.buying_criteria.length > 0)
          out.push(`Buying criteria: ${seg.buying_criteria.join("; ")}`);
        if (seg.objections && seg.objections.length > 0)
          out.push(`Objections: ${seg.objections.join("; ")}`);
      }
      return out;
    },
  },
  {
    id: "messaging",
    title: "## Messaging",
    tier: "T0",
    includeInGrounding: false,
    render: ({ dna }) => {
      const strat = dna.strategy;
      if (!strat) return [];
      const out: string[] = [];
      if (strat.value_proposition) out.push(`Value proposition: ${strat.value_proposition}`);
      if (strat.taglines?.primary) out.push(`Primary tagline: ${strat.taglines.primary}`);
      if (strat.taglines?.alternates && strat.taglines.alternates.length > 0)
        out.push(`Alternate taglines: ${strat.taglines.alternates.join(" | ")}`);
      for (const mp of strat.message_pillars ?? []) {
        const proof =
          mp.proof_points && mp.proof_points.length > 0
            ? ` (proof: ${mp.proof_points.join("; ")})`
            : "";
        out.push(`- ${mp.pillar}: ${mp.description}${proof}`);
      }
      return out;
    },
  },
  {
    id: "readiness",
    title: "## Readiness",
    tier: "T1",
    includeInGrounding: false,
    render: ({ result }) => {
      const r = result?.readiness;
      if (!r) return [];
      const rows = READINESS_DIMENSIONS.map((key) => {
        const dim = r.dimensions[key];
        return [key, `${dim.score}`, dim.rationale];
      });
      return [`Overall readiness: ${r.overall_score}/100`, "", ...mdTable(["Dimension", "Score", "Rationale"], rows)];
    },
  },
  {
    id: "section_scores",
    title: "## Section scores",
    tier: "T1",
    includeInGrounding: false,
    render: ({ result }) => {
      const audits = result?.audits;
      if (!audits) return [];
      const rows: string[][] = [];
      for (const [section, audit] of Object.entries(audits)) {
        if (audit) rows.push([section, `${audit.score}`, audit.severity]);
      }
      return rows.length > 0 ? mdTable(["Section", "Score", "Severity"], rows) : [];
    },
  },
  {
    id: "deep_narrative",
    title: "## Strategic narrative",
    tier: "T2",
    includeInGrounding: false,
    render: ({ result }) =>
      renderDeep(result, (deep) => {
        const n = deep.strategic_narrative;
        if (!n) return [];
        const out: string[] = [];
        if (n.mission.length > 0) out.push(`Mission: ${n.mission.join(" ")}`);
        if (n.vision.length > 0) out.push(`Vision: ${n.vision.join(" ")}`);
        if (n.core_values.length > 0) out.push(`Core values: ${n.core_values.join(", ")}`);
        return out;
      }),
  },
  {
    id: "deep_messaging",
    title: "## Messaging system",
    tier: "T2",
    includeInGrounding: false,
    render: ({ result }) =>
      renderDeep(result, (deep) => {
        const m = deep.messaging_system;
        if (!m) return [];
        const out: string[] = [];
        if (m.summary) out.push(m.summary);
        if (m.positioning) out.push(`Positioning: ${m.positioning}`);
        if (m.differentiators.length > 0) out.push(`Differentiators: ${m.differentiators.join("; ")}`);
        if (m.recommendations.length > 0) out.push(`Recommendations: ${m.recommendations.join("; ")}`);
        return out;
      }),
  },
  {
    id: "deep_product",
    title: "## Product",
    tier: "T2",
    includeInGrounding: false,
    render: ({ result }) =>
      renderDeep(result, (deep) => {
        const p = deep.product;
        if (!p) return [];
        const out: string[] = [];
        if (p.product_name) out.push(`Product: ${p.product_name}`);
        if (p.product_description) out.push(p.product_description);
        if (p.product_features.length > 0) out.push(`Features: ${p.product_features.join("; ")}`);
        if (p.product_benefits.length > 0) out.push(`Benefits: ${p.product_benefits.join("; ")}`);
        return out;
      }),
  },
  {
    id: "deep_personas",
    title: "## Deep personas",
    tier: "T2",
    includeInGrounding: false,
    render: ({ result }) =>
      renderDeep(result, (deep) => {
        const dp = deep.deep_personas;
        if (!dp) return [];
        const out: string[] = [];
        if (dp.summary) out.push(dp.summary);
        for (const seg of dp.segments) {
          out.push(`### ${seg.name}`);
          if (seg.description) out.push(seg.description);
          if (seg.motivations.length > 0) out.push(`Motivations: ${seg.motivations.join("; ")}`);
          if (seg.barriers.length > 0) out.push(`Barriers: ${seg.barriers.join("; ")}`);
        }
        return out;
      }),
  },
  {
    id: "deep_competition",
    title: "## Competitive frame",
    tier: "T2",
    includeInGrounding: false,
    render: ({ result }) =>
      renderDeep(result, (deep) => {
        const c = deep.competitive_frame;
        if (!c) return [];
        const out: string[] = [];
        for (const comp of c.top_competitors) {
          const bits = [comp.strategy_summary, comp.key_messaging].filter(Boolean).join(" — ");
          out.push(bits ? `- ${comp.name}: ${bits}` : `- ${comp.name}`);
        }
        if (c.insights) out.push(`Insights: ${c.insights}`);
        if (c.recommendations) out.push(`Recommendations: ${c.recommendations}`);
        return out;
      }),
  },
];

// Deterministic LEAN markdown projection — the SINGLE grounding block every agent
// injects, derived from the registry (grounding sections only). Sections with no
// data are omitted so a thin brand never emits empty headings.
export function renderBrandDnaMarkdown(dna: BrandDna): string {
  const lines: string[] = [`# ${dna.brand_name} — Brand DNA`];
  if (dna.website_url) lines.push(`Website: ${dna.website_url}`);
  for (const section of BRAND_BIBLE_SECTIONS) {
    if (!section.includeInGrounding) continue;
    pushSection(lines, section.title, section.render({ mode: "lean", dna }));
  }
  return lines.join("\n");
}

// Full-fidelity Brand Book — every tier (T0 identity, T1 scores, T2 deep) plus a
// governance footer. The durable read/store side persists this into
// brand_report_composites.summary_markdown. T2 sections render pending stubs
// until the deep job fills `result.deep`.
export function renderBrandBibleMarkdown(result: BrandReportResult): string {
  const dna = toBrandDna(result);
  const lines: string[] = [`# ${dna.brand_name} — Brand Book`];
  if (dna.website_url) lines.push(`Website: ${dna.website_url}`);
  for (const section of BRAND_BIBLE_SECTIONS) {
    pushSection(lines, section.title, section.render({ mode: "full", dna, result }));
  }
  const footer: string[] = [`Prompt version: ${result.prompt_version}`];
  const generatedAt = result.deep?.generated_at ?? result.readiness?.generated_at ?? null;
  if (generatedAt) footer.push(`Generated: ${generatedAt}`);
  pushSection(lines, "## Governance", footer);
  return lines.join("\n");
}
