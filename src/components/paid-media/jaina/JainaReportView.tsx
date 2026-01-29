"use client";

import {
  Badge,
  Box,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
} from "@radix-ui/themes";
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

type JainaReportViewProps = {
  report: SoTReport | null;
  status: JainaStreamStatus;
  error?: string;
};

export function JainaReportView({ report, status, error }: JainaReportViewProps) {
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

  return (
    <Flex direction="column" gap="4">
      <Card className="border border-subtle bg-surface">
        <Box p="4" className="space-y-2">
          <Flex align="center" justify="between">
            <Heading size="4">Executive Summary</Heading>
            <Badge color="blue" variant="soft">{report.language}</Badge>
          </Flex>
          <SafeMarkdown content={report.executive_summary} className="text-sm text-primary" mode="static" />
        </Box>
      </Card>

      {report.performance_snapshot.length ? (
        <Card className="border border-subtle bg-surface">
          <Box p="4" className="space-y-4">
            <Heading size="4">Performance Snapshot</Heading>
            <Flex direction="column" gap="4">
              {report.performance_snapshot.map((section) => (
                <TableSection key={section.title} section={section} />
              ))}
            </Flex>
          </Box>
        </Card>
      ) : null}

      {report.graphs.length ? (
        <Card className="border border-subtle bg-surface">
          <Box p="4" className="space-y-4">
            <Heading size="4">Key Trends</Heading>
            <Grid columns={{ initial: "1", lg: "2" }} gap="4">
              {report.graphs.map((graph) => (
                <GraphCard key={graph.title} graph={graph} />
              ))}
            </Grid>
          </Box>
        </Card>
      ) : null}

      {report.sections.map((section) => (
        <Card key={`${section.heading}-${section.scope}`} className="border border-subtle bg-surface">
          <Box p="4" className="space-y-4">
            <Flex align="center" justify="between" gap="2" wrap="wrap">
              <Box>
                <Heading size="4">{section.heading}</Heading>
                <Text size="2" color="gray">{section.scope}</Text>
              </Box>
              {section.confidence ? (
                <Badge color="purple" variant="soft">Confidence: {section.confidence}</Badge>
              ) : null}
            </Flex>
            <SafeMarkdown content={section.summary} className="text-sm text-primary" mode="static" />

            {section.highlights.length ? (
              <Box>
                <Heading size="3" className="mb-2">Highlights</Heading>
                <Flex direction="column" gap="2">
                  {section.highlights.map((item) => (
                    <HighlightItem key={item.text} item={item} />
                  ))}
                </Flex>
              </Box>
            ) : null}

            {section.tables.length ? (
              <Flex direction="column" gap="4">
                {section.tables.map((table) => (
                  <TableSection key={table.title} section={table} />
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
              <Box>
                <Heading size="3" className="mb-2">Recommended Actions</Heading>
                <Flex direction="column" gap="2">
                  {section.actions.map((action) => (
                    <Card key={action.title} className="border border-white/10 bg-default">
                      <Box p="3" className="space-y-1">
                        <Flex align="center" justify="between">
                          <Text weight="medium">{action.title}</Text>
                          <Badge color="amber" variant="soft">{action.priority}</Badge>
                        </Flex>
                        <Text size="2" color="gray">{action.rationale}</Text>
                        {action.expected_impact ? (
                          <Text size="2">Expected impact: {action.expected_impact}</Text>
                        ) : null}
                      </Box>
                    </Card>
                  ))}
                </Flex>
              </Box>
            ) : null}
          </Box>
        </Card>
      ))}

      <Card className="border border-subtle bg-surface">
        <Box p="4" className="space-y-4">
          <Heading size="4">Strategic Recommendations</Heading>
          <Flex direction="column" gap="2">
            {report.strategic_recommendations.map((item) => (
              <Card key={item.title} className="border border-white/10 bg-default">
                <Box p="3" className="space-y-1">
                  <Flex align="center" justify="between">
                    <Text weight="medium">{item.title}</Text>
                    <Badge color="indigo" variant="soft">{item.priority}</Badge>
                  </Flex>
                  <Text size="2" color="gray">{item.rationale}</Text>
                  {item.expected_impact ? (
                    <Text size="2">Expected impact: {item.expected_impact}</Text>
                  ) : null}
                </Box>
              </Card>
            ))}
          </Flex>
        </Box>
      </Card>

      <Card className="border border-subtle bg-surface">
        <Box p="4" className="space-y-3">
          <Heading size="4">Follow-up Questions</Heading>
          <Flex direction="column" gap="2">
            {report.follow_up_questions.map((question, index) => (
              <Text key={`${question}-${index}`} size="2">
                {question}
              </Text>
            ))}
          </Flex>
        </Box>
      </Card>

      {report.cached_sources.length ? (
        <Card className="border border-subtle bg-surface">
          <Box p="4" className="space-y-2">
            <Heading size="4">Cached Sources</Heading>
            <Flex gap="2" wrap="wrap">
              {report.cached_sources.map((source) => (
                <Badge key={source} color="gray" variant="soft">
                  {source}
                </Badge>
              ))}
            </Flex>
          </Box>
        </Card>
      ) : null}
    </Flex>
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
          <thead className="text-xs uppercase text-secondary">
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
    }));
    return (
      <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} stroke="transparent">
            {pieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent />} />
        </PieChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
      {graph.graph_type === "line" ? (
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {seriesKeys.map((entry) => (
            <Line key={entry.key} type="monotone" dataKey={entry.key} stroke={`var(--color-${entry.key})`} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      ) : graph.graph_type === "area" ? (
        <AreaChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {seriesKeys.map((entry) => (
            <Area key={entry.key} type="monotone" dataKey={entry.key} stroke={`var(--color-${entry.key})`} fill={`var(--color-${entry.key})`} fillOpacity={0.2} />
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
              fill={`var(--color-${entry.key})`}
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
