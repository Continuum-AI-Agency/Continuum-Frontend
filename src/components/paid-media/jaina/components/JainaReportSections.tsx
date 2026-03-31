"use client";

import { Card, Box, Text, Badge, Heading, Flex } from "@radix-ui/themes";
import { CheckCircle2Icon, AlertCircleIcon, InfoIcon } from "lucide-react";
import { type FrontendCheckpointReport } from "@/lib/jaina/schemas";
import { JainaReportCharts, isJainaChartInput } from "./JainaReportCharts";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";

type JainaReportSectionsProps = {
  sections: FrontendCheckpointReport["sections"];
  isStreaming?: boolean;
};

export function JainaReportSections({ sections, isStreaming }: JainaReportSectionsProps) {
  if (!sections || sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map((section, index) => (
        <SectionCard key={index} section={section} isStreaming={isStreaming} />
      ))}
    </div>
  );
}

function SectionCard({ 
  section,
  isStreaming
}: { 
  section: FrontendCheckpointReport["sections"][number],
  isStreaming?: boolean
}) {
  const severityColor = {
    positive: "green",
    neutral: "blue",
    watch: "yellow",
    risk: "red",
  } as const;

  const severityTextClass = {
    positive: "text-green-500",
    neutral: "text-blue-500",
    watch: "text-yellow-500",
    risk: "text-red-500",
  } as const;

  const severityIcon = {
    positive: CheckCircle2Icon,
    neutral: InfoIcon,
    watch: AlertCircleIcon,
    risk: AlertCircleIcon,
  };

  const sectionCharts = Array.isArray(section.graphs)
    ? section.graphs.filter((chart) => isJainaChartInput(chart))
    : [];
  const sectionTables = Array.isArray(section.tables)
    ? section.tables
        .map((table) => toRenderableTable(table))
        .filter((table): table is RenderableTable => Boolean(table))
    : [];

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center gap-3">
        <Heading size="4" className="text-primary/80">
          {section.heading}
        </Heading>
        <Badge color="gray" variant="soft" className="capitalize">
          {section.scope}
        </Badge>
        {section.confidence && (
          <Badge color="blue" variant="soft">
            {section.confidence} confidence
          </Badge>
        )}
      </div>

      {section.summary && (
        <div className="prose prose-invert max-w-none">
          <SafeMarkdown
            content={section.summary}
            className="text-[15px] leading-relaxed text-white/70"
            mode={isStreaming ? "streaming" : "static"}
          />
        </div>
      )}

      {section.highlights && section.highlights.length > 0 && (
        <div className="space-y-3">
          {section.highlights.map((highlight, hIndex) => {
            const Icon = severityIcon[highlight.severity];
            return (
              <Card key={hIndex} className="bg-white/5 border-white/5">
                <Box p="3">
                  <Flex gap="3" align="start">
                    <div className={`mt-0.5 ${severityTextClass[highlight.severity]}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      {highlight.title && (
                        <Text size="2" weight="bold" className="text-white/90">
                          {highlight.title}
                        </Text>
                      )}
                      <Text size="2" className="text-white/70">
                        {highlight.text}
                      </Text>
                      {highlight.impact && (
                        <Badge color={severityColor[highlight.severity]} variant="soft" size="1">
                          {highlight.impact}
                        </Badge>
                      )}
                      {highlight.evidence && highlight.evidence.length > 0 && (
                        <div className="mt-2 text-xs text-white/50">
                          Evidence: {highlight.evidence.join(", ")}
                        </div>
                      )}
                    </div>
                  </Flex>
                </Box>
              </Card>
            );
          })}
        </div>
      )}

      {sectionCharts.length > 0 && (
        <div className="pt-2">
          <JainaReportCharts charts={sectionCharts} showHeading={false} />
        </div>
      )}

      {sectionTables.length > 0 && (
        <div className="space-y-4">
          {sectionTables.map((table, tIndex) => (
            <Card key={tIndex} className="min-w-0 border border-white/10 bg-black/20 overflow-hidden">
              <Box p="0">
                {table.title ? (
                  <div className="border-b border-white/10 bg-white/5 px-4 py-2">
                    <Text size="2" weight="medium" className="text-white/85">
                      {table.title}
                    </Text>
                    {table.subtitle ? (
                      <Text size="1" className="text-white/60 block mt-0.5">
                        {table.subtitle}
                      </Text>
                    ) : null}
                  </div>
                ) : null}
                <div className="w-full max-w-full overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        {table.headers.map((header, headerIndex) => (
                          <th
                            key={headerIndex}
                            className="text-left px-4 py-3 text-white/70 font-medium uppercase text-xs tracking-wider whitespace-nowrap"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                        >
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="px-4 py-3 text-white/80 whitespace-nowrap"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Box>
            </Card>
          ))}
        </div>
      )}

      {section.actions && section.actions.length > 0 && (
        <div className="space-y-3 pt-2">
          <Text size="2" weight="bold" className="text-white/80 uppercase tracking-wider">
            Recommended Actions
          </Text>
          {section.actions.map((action, aIndex) => (
            <Card key={aIndex} className="bg-white/5 border-white/5 border-l-4 border-l-indigo-500">
              <Box p="3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Text size="2" weight="bold" className="text-white/90">
                      {action.title || "Action"}
                    </Text>
                    <div className="flex gap-2">
                      {action.priority && (
                        <Badge color="blue" variant="soft" size="1">
                          {action.priority}
                        </Badge>
                      )}
                      {action.expected_impact && (
                        <Badge color="green" variant="soft" size="1">
                          Impact: {action.expected_impact}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Text size="2" className="text-white/70">
                    {action.rationale}
                  </Text>
                </div>
              </Box>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

type RenderableTable = {
  title?: string;
  subtitle?: string | null;
  headers: string[];
  rows: string[][];
};

function toRenderableTable(value: unknown): RenderableTable | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const table = value as Record<string, unknown>;

  const headersValue = Array.isArray(table.headers) ? table.headers : [];
  const rowsValue = Array.isArray(table.rows) ? table.rows : [];

  if (headersValue.length > 0 && rowsValue.length > 0) {
    const headers = headersValue.map((header) => String(header));
    return {
      title: typeof table.title === "string" ? table.title : undefined,
      subtitle:
        typeof table.subtitle === "string" ? table.subtitle : null,
      headers,
      rows: rowsValue.map((row) => {
        if (Array.isArray(row)) {
          return row.map((cell) => String(cell ?? ""));
        }
        if (row && typeof row === "object") {
          const objectRow = row as Record<string, unknown>;
          return headers.map((header) => String(objectRow[header] ?? ""));
        }
        return [];
      }),
    };
  }

  if (rowsValue.length > 0) {
    const arrayRows = rowsValue.filter((row) => Array.isArray(row)) as unknown[][];
    if (arrayRows.length > 0) {
      const width = Math.max(...arrayRows.map((row) => row.length));
      const generatedHeaders = Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
      return {
        title: typeof table.title === "string" ? table.title : undefined,
        subtitle:
          typeof table.subtitle === "string" ? table.subtitle : null,
        headers: generatedHeaders,
        rows: arrayRows.map((row) => row.map((cell) => String(cell ?? ""))),
      };
    }

    const objectRows = rowsValue.filter(
      (row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row))
    );
    if (objectRows.length === 0) return null;

    const headers = Object.keys(objectRows[0]);
    if (headers.length === 0) return null;

    return {
      title: typeof table.title === "string" ? table.title : undefined,
      subtitle:
        typeof table.subtitle === "string" ? table.subtitle : null,
      headers,
      rows: objectRows.map((row) => headers.map((header) => String(row[header] ?? ""))),
    };
  }

  return null;
}
