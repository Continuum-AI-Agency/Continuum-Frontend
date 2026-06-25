import { Badge, Heading, Text } from "@radix-ui/themes";
import {
  DOCUMENT_CATEGORY_LABELS,
  parseBrandMd,
  type BrandBookResponse,
  type BrandColorToken,
  type DocumentCategory,
} from "@continuum/contracts";
import { buildBrandBookView } from "./brandBookView";
import { BrandBookActions } from "./BrandBookActions";
import { BrandBookEmptyState } from "./BrandBookEmptyState";
import { BrandMdDirtyProvider } from "./BrandMdDirtyContext";
import { BrandMdEditor } from "./BrandMdEditor";
import { BrandScorecard } from "./BrandScorecard";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import type { BrandBookGenerationPayload } from "./brandBookGeneration";

export type BrandBookGeneration = {
  brandId: string;
  brandName: string;
  payload: BrandBookGenerationPayload | null;
};

// Renders one section's markdown-ish body lines: groups consecutive table rows
// (`| … |`) into a monospace block and treats `### ` lines as sub-headings.
function SectionBody({ lines }: { lines: string[] }) {
  const nodes: React.ReactNode[] = [];
  let table: string[] = [];

  const flushTable = (key: string) => {
    if (table.length === 0) return;
    nodes.push(
      <pre
        key={key}
        className="overflow-x-auto rounded-md bg-black/20 px-3 py-2 font-mono text-xs text-gray-300"
      >
        {table.join("\n")}
      </pre>,
    );
    table = [];
  };

  lines.forEach((line, i) => {
    if (line.startsWith("| ")) {
      table.push(line);
      return;
    }
    flushTable(`tbl-${i}`);
    if (line.startsWith("### ")) {
      nodes.push(
        <p key={i} className="mt-2 text-sm font-medium text-gray-200">
          {line.slice(4)}
        </p>,
      );
    } else {
      nodes.push(
        <p key={i} className="text-sm text-gray-400">
          {line}
        </p>,
      );
    }
  });
  flushTable("tbl-end");

  return <div className="space-y-1">{nodes}</div>;
}

function DocumentsPanel({ documents }: { documents: BrandBookResponse["documents"] }) {
  if (documents.length === 0) {
    return (
      <Text size="2" color="gray">
        No documents tagged for this brand yet. Upload guidelines, personas, or strategy docs under Knowledge.
      </Text>
    );
  }

  const byCategory = new Map<DocumentCategory, BrandBookResponse["documents"]>();
  for (const doc of documents) {
    const list = byCategory.get(doc.category) ?? [];
    list.push(doc);
    byCategory.set(doc.category, list);
  }

  return (
    <div className="space-y-3">
      {[...byCategory.entries()].map(([category, docs]) => (
        <div key={category}>
          <Text size="1" weight="medium" className="text-gray-300">
            {DOCUMENT_CATEGORY_LABELS[category]}
          </Text>
          <ul className="mt-1 space-y-0.5">
            {docs.map((doc) => (
              <li key={doc.id} className="text-sm text-gray-400">
                {doc.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Palette swatch strip rendered from the brand_tokens.colors array.
function ColorSwatchStrip({ colors }: { colors: BrandColorToken[] }) {
  if (colors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((token, i) => (
        <div key={`${token.value}-${i}`} className="flex items-center gap-1.5">
          <span
            role="img"
            className="inline-block h-5 w-5 rounded-sm border border-white/20 shrink-0"
            style={{ backgroundColor: token.value }}
            aria-label={token.name ?? token.value}
          />
          <span className="text-xs text-gray-400">
            {token.name ? `${token.name} ` : ""}
            <span className="font-mono text-gray-500">{token.value}</span>
            {token.role ? (
              <span className="ml-1 text-gray-600">· {token.role}</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// Tier groups + scorecard rendered from the structured composite.
// Kept as backward-compat fallback when brand_md is null (un-migrated brand)
// and also rendered alongside the brand.md prose for supplemental structure.
function StructuredTierGroups({ brandBook }: { brandBook: BrandBookResponse }) {
  const view = buildBrandBookView(brandBook.composite);
  return (
    <>
      {view.groups.map((group) => (
        <section key={group.tier} className="space-y-3">
          <Heading size="3" className="text-white">
            {group.label}
          </Heading>
          <div className="space-y-4">
            {group.sections.map((section) => (
              <div
                key={section.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Text size="2" weight="medium" className="text-gray-200">
                    {section.title}
                  </Text>
                  {section.pending ? (
                    <Badge color="gray" variant="soft" radius="full">
                      Filling in…
                    </Badge>
                  ) : null}
                </div>
                {section.pending ? (
                  <Text size="1" color="gray">
                    Deep analysis fills in automatically after onboarding.
                  </Text>
                ) : (
                  <SectionBody lines={section.lines} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// BrandMdDirtyProvider must wrap both BrandBookActions (which reads the dirty
// flag to suppress auto-refresh) and BrandMdEditor (which sets it). Since
// BrandBookSection is an RSC the provider is a thin "use client" wrapper
// declared in BrandMdDirtyContext.tsx — no "use client" needed here.
export function BrandBookSection({
  brandBook,
  generation,
}: {
  brandBook: BrandBookResponse | null;
  generation?: BrandBookGeneration | null;
}) {
  if (!brandBook) {
    if (generation) {
      return (
        <BrandBookEmptyState
          brandId={generation.brandId}
          brandName={generation.brandName}
          payload={generation.payload}
        />
      );
    }
    return (
      <Text color="gray">
        Your Brand Book appears here once onboarding has generated your brand report.
      </Text>
    );
  }

  const colors = brandBook.brand_tokens?.colors ?? [];
  const hasBrandMd = brandBook.brand_md !== null;

  return (
    <BrandMdDirtyProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <BrandBookActions brandId={brandBook.brand_id} />
        </div>

        {/* Readiness scorecard — always shown when data is present */}
        <BrandScorecard result={brandBook.composite} brandId={brandBook.brand_id} />

        {/* Color palette from brand tokens */}
        {colors.length > 0 ? (
          <section className="space-y-2">
            <Heading size="3" className="text-white">
              Brand colors
            </Heading>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
              <ColorSwatchStrip colors={colors} />
            </div>
          </section>
        ) : null}

        {/* Brand document prose — SafeMarkdown body when brand_md is present,
            structured tier groups as fallback for un-migrated brands */}
        {hasBrandMd ? (
          <section className="space-y-3">
            <Heading size="3" className="text-white">
              Brand document
            </Heading>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
              <SafeMarkdown
                content={parseBrandMd(brandBook.brand_md!).body}
                mode="static"
                className="prose prose-invert prose-sm max-w-none"
              />
            </div>
          </section>
        ) : (
          <StructuredTierGroups brandBook={brandBook} />
        )}

        {/* Editor — mounted for all brands; shows an empty-state CTA when
            brand_md has not been generated yet */}
        <section className="space-y-3">
          <Heading size="3" className="text-white">
            Edit brand document
          </Heading>
          <BrandMdEditor
            brandId={brandBook.brand_id}
            initialBrandMd={brandBook.brand_md}
            isEdited={brandBook.brand_md_is_edited}
          />
        </section>

        <section className="space-y-2">
          <Heading size="3" className="text-white">
            Source documents
          </Heading>
          <DocumentsPanel documents={brandBook.documents} />
        </section>
      </div>
    </BrandMdDirtyProvider>
  );
}
