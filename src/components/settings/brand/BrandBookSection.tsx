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
// Lazy (client-only, ssr:false) variant: BrandBookSection is a Server Component,
// and the non-lazy SafeMarkdown passes remark/rehype plugin FUNCTIONS to the
// client Streamdown — which can't cross the RSC boundary. The lazy wrapper keeps
// the plugins entirely client-side (and keeps KaTeX/Shiki out of first paint).
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import type { BrandBookGenerationPayload } from "./brandBookGeneration";

export type BrandBookGeneration = {
  brandId: string;
  brandName: string;
  payload: BrandBookGenerationPayload | null;
};

type Assembled = NonNullable<BrandBookResponse["assembled"]>;
type BookDocument = BrandBookResponse["documents"][number];

// Renders the string/number/boolean leaves of an arbitrary stored object as a
// label:value list, recursing one level into nested objects. Used to surface
// onboarding intake and structured guideline sections without hard-coding their
// (loosely-typed, evolving) shapes.
function RecordList({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || typeof data !== "object") return null;
  const entries = Object.entries(data as Record<string, unknown>).filter(([, v]) => {
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
  if (entries.length === 0) return null;

  const label = (key: string) =>
    key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <dl className="space-y-1">
      {entries.map(([key, value]) => {
        const isLeaf =
          typeof value === "string" || typeof value === "number" || typeof value === "boolean";
        const isStringArray =
          Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number");
        return (
          <div key={key} className="text-sm">
            <dt className="inline text-gray-400">{label(key)}: </dt>
            {isLeaf ? (
              <dd className="inline text-gray-200">{String(value)}</dd>
            ) : isStringArray ? (
              <dd className="inline text-gray-200">{(value as unknown[]).join(", ")}</dd>
            ) : depth < 1 && value && typeof value === "object" && !Array.isArray(value) ? (
              <dd className="mt-1 border-l border-white/10 pl-3">
                <RecordList data={value} depth={depth + 1} />
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

function OnboardingPanel({ onboarding }: { onboarding: Assembled["onboarding"] }) {
  if (!onboarding || !onboarding.present) {
    return (
      <Text size="2" color="gray">
        No onboarding intake captured for this brand yet.
      </Text>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-2">
        <Badge color={onboarding.completed ? "green" : "gray"} variant="soft" radius="full">
          {onboarding.completed ? "Onboarding complete" : "Onboarding in progress"}
        </Badge>
      </div>
      <RecordList data={onboarding.summary} />
    </div>
  );
}

const GUIDELINE_SECTIONS = [
  "colors",
  "typography",
  "verbal_identity",
  "logo",
  "stationery",
  "style_design",
] as const;

function GuidelinesPanel({ guidelines }: { guidelines: Assembled["guidelines"] }) {
  if (!guidelines || guidelines.length === 0) {
    return (
      <Text size="2" color="gray">
        Brand guidelines generate automatically in the background after onboarding. They will appear
        here once ready.
      </Text>
    );
  }
  return (
    <div className="space-y-4">
      {guidelines.map((guideline, i) => {
        const record = guideline as Record<string, unknown>;
        const purpose = typeof record.purpose === "string" ? record.purpose : "general";
        const notes = typeof record.notes === "string" ? record.notes : null;
        return (
          <div
            key={`${purpose}-${i}`}
            className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Text size="2" weight="medium" className="text-gray-200 capitalize">
                {purpose}
              </Text>
              {typeof record.status === "string" ? (
                <Badge color="gray" variant="soft" radius="full">
                  {record.status}
                </Badge>
              ) : null}
            </div>
            {notes ? <Text size="2" color="gray">{notes}</Text> : null}
            {GUIDELINE_SECTIONS.map((section) => {
              const value = record[section];
              if (!value || typeof value !== "object" || Array.isArray(value)) return null;
              if (Object.keys(value as object).length === 0) return null;
              return (
                <div key={section}>
                  <Text size="1" weight="medium" className="text-gray-300 capitalize">
                    {section.replace(/_/g, " ")}
                  </Text>
                  <div className="mt-1">
                    <RecordList data={value} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function DocumentsPanel({ documents }: { documents: BookDocument[] }) {
  if (documents.length === 0) {
    return (
      <Text size="2" color="gray">
        No documents tagged for this brand yet. Upload guidelines, personas, or strategy docs under
        Knowledge.
      </Text>
    );
  }

  const byCategory = new Map<DocumentCategory, BookDocument[]>();
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
          <ul className="mt-1 space-y-1">
            {docs.map((doc) => (
              <li key={doc.id} className="text-sm text-gray-400">
                <span className="text-gray-300">{doc.name}</span>
                {doc.excerpt ? (
                  <span className="block text-xs text-gray-500 line-clamp-2">{doc.excerpt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

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
            {token.role ? <span className="ml-1 text-gray-600">· {token.role}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <Heading size="3" className="text-white">
        {title}
      </Heading>
      {children}
    </section>
  );
}

// The optional brand-report/readiness analytical layer — rendered only when a
// report composite exists (the book no longer depends on it).
function ReportLayer({ brandBook }: { brandBook: BrandBookResponse }) {
  const composite = brandBook.composite;
  if (!composite) return null;
  const colors = brandBook.brand_tokens?.colors ?? [];
  const brandMd = brandBook.brand_md;
  return (
    <>
      <BrandScorecard result={composite} brandId={brandBook.brand_id} />
      {colors.length > 0 ? (
        <Section title="Brand colors">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
            <ColorSwatchStrip colors={colors} />
          </div>
        </Section>
      ) : null}
      {brandMd ? (
        <Section title="Brand narrative">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
            <SafeMarkdown
              content={parseBrandMd(brandMd).body}
              mode="static"
              className="prose prose-invert prose-sm max-w-none"
            />
          </div>
        </Section>
      ) : (
        <StructuredTierGroups composite={composite} />
      )}
    </>
  );
}

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

function StructuredTierGroups({ composite }: { composite: NonNullable<BrandBookResponse["composite"]> }) {
  const view = buildBrandBookView(composite);
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

// The Brand Book is a materialized composite of onboarding + guidelines +
// documents (+ the optional report layer). It switches on `status`: an
// absent/assembling/errored book routes to the empty-state CTA; a ready book
// renders every source section.
export function BrandBookSection({
  brandBook,
  generation,
}: {
  brandBook: BrandBookResponse | null;
  generation?: BrandBookGeneration | null;
}) {
  if (!brandBook || !brandBook.present) {
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
        Your Brand Book is assembling from your onboarding, guidelines, and documents. Check back in
        a moment.
      </Text>
    );
  }

  const assembled = brandBook.assembled;
  const onboarding = assembled?.onboarding ?? null;
  const guidelines = assembled?.guidelines ?? [];
  const documents = (assembled?.documents ?? brandBook.documents) as BookDocument[];
  const brandMd = brandBook.brand_md;

  return (
    <BrandMdDirtyProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <BrandBookActions brandId={brandBook.brand_id} />
        </div>

        <Section title="Onboarding">
          <OnboardingPanel onboarding={onboarding} />
        </Section>

        <Section title="Brand guidelines">
          <GuidelinesPanel guidelines={guidelines} />
        </Section>

        <Section title="Source documents">
          <DocumentsPanel documents={documents} />
        </Section>

        <ReportLayer brandBook={brandBook} />

        <Section title="Edit brand document">
          <BrandMdEditor
            brandId={brandBook.brand_id}
            initialBrandMd={brandMd}
            isEdited={brandBook.brand_md_is_edited}
          />
        </Section>
      </div>
    </BrandMdDirtyProvider>
  );
}
