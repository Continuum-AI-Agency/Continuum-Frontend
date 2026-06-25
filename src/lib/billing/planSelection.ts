import type { Product } from "@continuum/contracts";

export type TrendsChoice = "off" | "base" | "pro";
export type InterestArea = "paid_media" | "organic" | "both" | null;

export type PlanBundle = {
  key: string;
  name: string;
  blurb: string;
  price: string;
  products: Product[];
};

// User-facing bundles → the entitlement products they grant.
export const PLAN_BUNDLES: PlanBundle[] = [
  {
    key: "canvas_organic",
    name: "Canvas Organic",
    blurb: "AI Studio + the Organic agent — analyze, ideate, and generate content at scale.",
    price: "$30/mo + usage",
    products: ["studio", "organic_agent"],
  },
  {
    key: "paid_media",
    name: "Paid Media (Jaina)",
    blurb: "Campaign observability + the Jaina analyst agent + the Paid Media tab.",
    price: "$300/mo",
    products: ["paid_media"],
  },
  {
    key: "mcp",
    name: "MCP Access",
    blurb: "Native MCP integrations for your tools and assistants.",
    price: "$15/mo",
    products: ["mcp"],
  },
];

// The products granted by a set of selected bundle keys + a Trends choice.
export function productsForSelection(selectedKeys: Iterable<string>, trends: TrendsChoice): Product[] {
  const keys = new Set(selectedKeys);
  const out = new Set<Product>();
  for (const bundle of PLAN_BUNDLES) {
    if (keys.has(bundle.key)) for (const product of bundle.products) out.add(product);
  }
  if (trends !== "off") out.add("trends");
  return [...out];
}

export function deriveInterestArea(products: Product[]): InterestArea {
  const organic = products.includes("studio") || products.includes("organic_agent");
  const paid = products.includes("paid_media");
  if (organic && paid) return "both";
  if (paid) return "paid_media";
  if (organic) return "organic";
  return null;
}

export function derivePrimaryPlanCode(products: Product[]): string | null {
  if (products.includes("paid_media")) return "paid_media";
  if (products.includes("studio")) return "organic_studio";
  if (products.includes("mcp")) return "mcp";
  return null;
}
