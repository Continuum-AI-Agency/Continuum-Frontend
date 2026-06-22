import { Badge, Heading, Text } from "@radix-ui/themes";
import {
  DOCUMENT_CATEGORY_LABELS,
  type BrandBookResponse,
  type DocumentCategory,
} from "@continuum/contracts";
import { buildBrandBookView } from "./brandBookView";
import { BrandBookActions } from "./BrandBookActions";

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

export function BrandBookSection({ brandBook }: { brandBook: BrandBookResponse | null }) {
  if (!brandBook) {
    return (
      <Text color="gray">
        Your Brand Book appears here once onboarding has generated your brand report.
      </Text>
    );
  }

  const view = buildBrandBookView(brandBook.composite);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <BrandBookActions brandId={brandBook.brand_id} />
      </div>
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

      <section className="space-y-2">
        <Heading size="3" className="text-white">
          Source documents
        </Heading>
        <DocumentsPanel documents={brandBook.documents} />
      </section>
    </div>
  );
}
