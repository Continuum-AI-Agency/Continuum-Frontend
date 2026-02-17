import { Card, Box, Text, Badge, Heading, Flex, Grid } from "@radix-ui/themes";
import { CheckCircle2Icon, AlertCircleIcon, InfoIcon } from "lucide-react";
import { type SoTReport } from "@/lib/jaina/schemas";
import { JainaReportCharts } from "./JainaReportCharts";

type JainaReportSectionsProps = {
  sections: SoTReport["sections"];
};

export function JainaReportSections({ sections }: JainaReportSectionsProps) {
  if (!sections || sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map((section, index) => (
        <SectionCard key={index} section={section} index={index} />
      ))}
    </div>
  );
}

function SectionCard({ section, index }: { section: SoTReport["sections"][number]; index: number }) {
  const severityColor = {
    positive: "green",
    neutral: "blue",
    watch: "yellow",
    risk: "red",
  } as const;

  const severityIcon = {
    positive: CheckCircle2Icon,
    neutral: InfoIcon,
    watch: AlertCircleIcon,
    risk: AlertCircleIcon,
  };

  return (
    <div className="space-y-4">
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
        <Text size="2" className="text-white/70 leading-relaxed">
          {section.summary}
        </Text>
      )}

      {section.highlights && section.highlights.length > 0 && (
        <div className="space-y-3">
          {section.highlights.map((highlight, hIndex) => {
            const Icon = severityIcon[highlight.severity];
            return (
              <Card key={hIndex} className="bg-white/5 border-white/5">
                <Box p="3">
                  <Flex gap="3" align="start">
                    <div className={`mt-0.5 text-${severityColor[highlight.severity]}-500`}>
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

      {section.graphs && section.graphs.length > 0 && (
        <div className="pt-2">
          <JainaReportCharts charts={section.graphs as any} />
        </div>
      )}

      {section.tables && section.tables.length > 0 && (
        <div className="space-y-4">
          {section.tables.map((table, tIndex) => (
            <Card key={tIndex} className="border border-white/10 bg-black/20 overflow-hidden">
              <Box p="0">
                <div className="overflow-x-auto">
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
                      {action.title || action.action || "Action"}
                    </Text>
                    <div className="flex gap-2">
                      {action.priority && (
                        <Badge color="blue" variant="soft" size="1">
                          {action.priority}
                        </Badge>
                      )}
                      {action.impact && (
                        <Badge color="green" variant="soft" size="1">
                          Impact: {action.impact}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Text size="2" className="text-white/70">
                    {action.description || action.rationale || ""}
                  </Text>
                  {action.expected_impact && (
                    <Text size="1" className="text-white/50">
                      Expected: {action.expected_impact}
                    </Text>
                  )}
                </div>
              </Box>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
