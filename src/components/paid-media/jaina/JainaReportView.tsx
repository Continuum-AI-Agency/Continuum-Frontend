"use client";

import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
} from "@radix-ui/themes";
import {
  DownloadIcon,
  EnvelopeClosedIcon,
} from "@radix-ui/react-icons";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import type { SoTReport } from "@/lib/jaina/schemas";
import type { JainaStreamStatus } from "@/lib/jaina/stream";
import { JainaReportNav } from "./components/JainaReportNav";

import {
  Artifact,
  ArtifactActions,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactAction,
} from "@/components/ai-elements/artifact";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { Task, TaskContent, TaskTrigger, TaskItem } from "@/components/ai-elements/task";

type JainaReportViewProps = {
  report: SoTReport | null;
  status: JainaStreamStatus;
  error?: string;
  onSuggestionClick?: (query: string) => void;
};

export function JainaReportView({ report, status, error, onSuggestionClick }: JainaReportViewProps) {
  if (status === "error") {
    return (
      <Callout.Root color="red" variant="surface">
        <Callout.Text>{error ?? "Unable to render report."}</Callout.Text>
      </Callout.Root>
    );
  }

  if (!report) {
    return <EmptyReport status={status} />;
  }

  const handleDownloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jaina-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendEmail = () => {
    alert("This feature is coming soon! It will allow you to send this report directly to your inbox.");
  };

  return (
    <Artifact className="border-white/10 bg-black/20 backdrop-blur-xl shadow-2xl">
      <ArtifactHeader className="bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="size-2 rounded-full bg-purple-500 animate-pulse" />
          <ArtifactTitle className="text-primary font-bold tracking-tight uppercase text-xs">
            Performance Analysis Report
          </ArtifactTitle>
        </div>
        <ArtifactActions>
          <ArtifactAction
            tooltip="Send to Email"
            icon={EnvelopeClosedIcon as any}
            onClick={handleSendEmail}
          />
          <ArtifactAction
            tooltip="Download JSON"
            icon={DownloadIcon as any}
            onClick={handleDownloadJSON}
          />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0">
        <Flex gap="0" align="start" className="relative h-full">
          <div className="hidden lg:block border-r border-white/5 p-4 sticky top-0">
            <JainaReportNav />
          </div>

          <Flex direction="column" gap="6" className="flex-1 p-6 overflow-y-auto no-scrollbar max-h-[800px]">
            <div id="executive-summary" className="space-y-4">
              <Flex align="center" justify="between">
                <Heading size="5" className="text-primary">Executive Summary</Heading>
                <Badge color="blue" variant="soft" className="uppercase tracking-tighter text-[10px]">
                  {report.language}
                </Badge>
              </Flex>
              <div className="prose prose-invert max-w-none">
                <SafeMarkdown
                  content={report.executive_summary || (report as any).summary || "No summary provided."}
                  className="text-[15px] leading-relaxed text-secondary"
                  mode="static"
                />
              </div>
            </div>

            {report.performance_snapshot.length ? (
              <div id="performance-snapshot" className="space-y-4 pt-4 border-t border-white/5">
                <Heading size="4" className="text-primary/80">Performance Snapshot</Heading>
                <Grid columns={{ initial: "1", md: "2" }} gap="4">
                  {report.performance_snapshot.map((section) => (
                    <Card key={section.title} className="bg-white/5 border-white/5 p-4 shadow-sm hover:bg-white/10 transition-colors">
                      <TableSection section={section} />
                    </Card>
                  ))}
                </Grid>
              </div>
            ) : null}

            {report.graphs.length ? (
              <div id="key-trends" className="space-y-4 pt-4 border-t border-white/5">
                <Heading size="4" className="text-primary/80">Key Trends</Heading>
                <Grid columns={{ initial: "1", lg: "2" }} gap="4">
                  {report.graphs.map((graph) => (
                    <GraphCard key={graph.title} graph={graph} />
                  ))}
                </Grid>
              </div>
            ) : null}

            {report.sections.map((section) => (
              <div
                key={`${section.heading}-${section.scope}`}
                id={section.heading.toLowerCase().replace(/\s+/g, "-")}
                className="space-y-6 pt-6 border-t border-white/5"
              >
                <Flex align="center" justify="between" gap="2" wrap="wrap">
                  <Box>
                    <Heading size="4" className="text-primary">{section.heading}</Heading>
                    <Text size="1" color="gray" className="uppercase tracking-widest opacity-60">
                      {section.scope}
                    </Text>
                  </Box>
                  {section.confidence ? (
                    <Badge color="purple" variant="soft" className="rounded-full px-3">
                      {section.confidence} Confidence
                    </Badge>
                  ) : null}
                </Flex>

                <SafeMarkdown content={section.summary} className="text-[14px] text-secondary leading-relaxed" mode="static" />

                {section.highlights.length ? (
                  <Box className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {section.highlights.map((item) => (
                      <HighlightItem key={item.text} item={item} />
                    ))}
                  </Box>
                ) : null}

                {section.tables.length ? (
                  <Flex direction="column" gap="4">
                    {section.tables.map((table) => (
                      <Card key={table.title} className="bg-white/5 border-white/5 p-4">
                        <TableSection section={table} />
                      </Card>
                    ))}
                  </Flex>
                ) : null}

                {section.graphs.length ? (
                  <Grid columns={{ initial: "1", lg: "2" }} gap="4">
                    {section.graphs.map((graph) => (
                      <GraphCard key={graph.title} graph={graph} />
                    ))}
                  </Grid>
                ) : null}

                {section.actions.length ? (
                  <div className="space-y-3">
                    <Text size="1" color="gray" weight="bold" className="uppercase tracking-widest block mb-2">
                      Recommended Actions
                    </Text>
                    {section.actions.map((action) => (
                      <Task key={action.title} status="pending" className="bg-white/5 border-white/5 rounded-lg overflow-hidden">
                        <TaskTrigger title={action.title} />
                        <TaskContent>
                          <div className="space-y-2 py-1">
                            <Text size="2" className="text-secondary">{action.rationale}</Text>
                            {action.expected_impact && (
                              <div className="flex items-center gap-2">
                                <Badge color="amber" variant="soft" className="text-[10px]">Impact</Badge>
                                <Text size="1" color="gray">{action.expected_impact}</Text>
                              </div>
                            )}
                          </div>
                        </TaskContent>
                      </Task>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            <div id="strategic-recommendations" className="space-y-4 pt-6 border-t border-white/5">
              <Heading size="4" className="text-primary">Strategic Recommendations</Heading>
              <div className="space-y-3">
                {report.strategic_recommendations.map((item) => (
                  <Task key={item.title} status="pending" className="bg-purple-500/5 border-purple-500/10 rounded-lg overflow-hidden">
                    <TaskTrigger title={item.title} />
                    <TaskContent>
                      <div className="space-y-2 py-1">
                        <Text size="2" className="text-secondary">{item.rationale}</Text>
                        <Flex align="center" gap="3">
                          <Badge color="indigo" variant="soft" className="text-[10px] uppercase">{item.priority} Priority</Badge>
                          {item.expected_impact && (
                            <Text size="1" color="gray">Est. Impact: {item.expected_impact}</Text>
                          )}
                        </Flex>
                      </div>
                    </TaskContent>
                  </Task>
                ))}
              </div>
            </div>

            <div id="follow-up-questions" className="space-y-4 pt-6 border-t border-white/5">
              <Heading size="4" className="text-primary/80">Continue Exploration</Heading>
              <Suggestions>
                {report.follow_up_questions.map((question, index) => (
                  <Suggestion
                    key={`${question}-${index}`}
                    suggestion={question}
                    onClick={onSuggestionClick}
                    className="bg-white/5 hover:bg-white/10 border-white/10 text-secondary whitespace-normal h-auto text-left py-2"
                  />
                ))}
              </Suggestions>
            </div>

            {report.cached_sources.length ? (
              <div id="cached-sources" className="pt-6 border-t border-white/5">
                <Sources>
                  <SourcesTrigger count={report.cached_sources.length} />
                  <SourcesContent>
                    {report.cached_sources.map((source) => (
                      <Source key={source} title={source} href="#" />
                    ))}
                  </SourcesContent>
                </Sources>
              </div>
            ) : null}
          </Flex>
        </Flex>
      </ArtifactContent>
    </Artifact>
  );
}

function EmptyReport({ status }: { status: JainaStreamStatus }) {
  return (
    <Card className="border border-subtle bg-surface">
      <Box p="4" className="space-y-2">
        <Heading size="4">Report Output</Heading>
        <Text color="gray">
          {status === "streaming"
            ? "Streaming data… this panel will populate as soon as the report is ready."
            : "Submit a question to generate a report."}
        </Text>
      </Box>
    </Card>
  );
}

type TableSectionProps = {
  section: SoTReport["performance_snapshot"][number];
};

function TableSection({ section }: TableSectionProps) {
  return (
    <Box className="space-y-2">
      <Flex align="center" justify="between" wrap="wrap">
        <Text weight="medium">{section.title}</Text>
        {section.subtitle ? (
          <Text size="1" color="gray">
            {section.subtitle}
          </Text>
        ) : null}
      </Flex>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase text-gray-400">
            <tr>
              <th className="py-2 pr-3">Metric</th>
              <th className="py-2 pr-3">Value</th>
              <th className="py-2 pr-3">Comparison</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.label} className="border-t border-white/5">
                <td className="py-2 pr-3">
                  <Flex align="center" gap="2">
                    <Text>{row.label}</Text>
                    {row.cached ? <Badge color="gray" variant="soft">cached</Badge> : null}
                  </Flex>
                </td>
                <td className="py-2 pr-3">{row.value}</td>
                <td className="py-2 pr-3 text-secondary">{row.comparison ?? "—"}</td>
                <td className="py-2 pr-3">
                  {row.status ? <Badge color="blue" variant="soft">{row.status}</Badge> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {section.notes ? <Text size="1" color="gray">{section.notes}</Text> : null}
    </Box>
  );
}

function HighlightItem({ item }: { item: SoTReport["sections"][number]["highlights"][number] }) {
  return (
    <Card className="border border-white/10 bg-default">
      <Box p="3" className="space-y-2">
        <Flex align="center" justify="between">
          <Text weight="medium">{item.category}</Text>
          <Badge color={severityToColor(item.severity)} variant="soft">{item.severity}</Badge>
        </Flex>
        <Text size="2">{item.text}</Text>
        {item.impact ? <Text size="2" color="gray">Impact: {item.impact}</Text> : null}
        {item.confidence ? <Text size="2" color="gray">Confidence: {item.confidence}</Text> : null}
        {item.evidence.length ? (
          <Flex gap="2" wrap="wrap">
            {item.evidence.map((evidence) => (
              <Badge key={evidence} color="gray" variant="soft">
                {evidence}
              </Badge>
            ))}
          </Flex>
        ) : null}
      </Box>
    </Card>
  );
}

function GraphCard({ graph }: { graph: SoTReport["graphs"][number] }) {
  return (
    <Card className="border border-white/10 bg-default">
      <Box p="3" className="space-y-2">
        <Text weight="medium">{graph.title}</Text>
        {graph.description ? (
          <Text size="2" color="gray">{graph.description}</Text>
        ) : null}
        <GraphChart graph={graph} />
        {graph.cached_sources.length ? (
          <Flex gap="2" wrap="wrap">
            {graph.cached_sources.map((source) => (
              <Badge key={source} color="gray" variant="soft">
                {source}
              </Badge>
            ))}
          </Flex>
        ) : null}
      </Box>
    </Card>
  );
}

function GraphChart({ graph }: { graph: SoTReport["graphs"][number] }) {
  const palette = [
    "var(--color-primary)",
    "var(--color-secondary)",
    "var(--color-accent)",
    "var(--color-brand-primary)",
    "var(--color-muted-foreground)",
  ];

  const seriesKeys = graph.series.map((series, index) => ({
    key: `series_${index}`,
    series,
    color: palette[index % palette.length],
  }));

  const chartConfig: ChartConfig = seriesKeys.reduce((acc, entry) => {
    acc[entry.key] = { label: entry.series.name, color: entry.color };
    return acc;
  }, {} as ChartConfig);

  const data: Array<Record<string, number | string | null>> = graph.labels.map((label, index) => {
    const row: Record<string, number | string | null> = { label };
    seriesKeys.forEach((entry) => {
      row[entry.key] = entry.series.values[index] ?? null;
    });
    return row;
  });

  if (graph.graph_type === "pie") {
    const firstSeries = graph.series[0];
    const pieData = graph.labels.map((label, index) => ({
      name: label,
      value: firstSeries?.values[index] ?? 0,
      fill: palette[index % palette.length],
    }));
    
    return (
      <ChartContainer config={chartConfig} className="h-[240px] w-full">
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} stroke="transparent">
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent />} />
        </PieChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      {graph.graph_type === "line" ? (
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {seriesKeys.map((entry) => (
            <Line key={entry.key} type="monotone" dataKey={entry.key} stroke={entry.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      ) : graph.graph_type === "area" ? (
        <AreaChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {seriesKeys.map((entry) => (
            <Area key={entry.key} type="monotone" dataKey={entry.key} stroke={entry.color} fill={entry.color} fillOpacity={0.2} />
          ))}
        </AreaChart>
      ) : (
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {seriesKeys.map((entry) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              stackId={graph.graph_type === "stacked_bar" ? "stack" : undefined}
              fill={entry.color}
              radius={4}
            />
          ))}
        </BarChart>
      )}
    </ChartContainer>
  );
}

function severityToColor(severity: "positive" | "neutral" | "watch" | "risk") {
  switch (severity) {
    case "positive":
      return "green";
    case "watch":
      return "amber";
    case "risk":
      return "red";
    default:
      return "gray";
  }
}
