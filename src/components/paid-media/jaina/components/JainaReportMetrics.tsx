import { Card, Flex, Grid, Text, Badge, Heading } from "@radix-ui/themes";
import { type FrontendCheckpointReport } from "@/lib/jaina/schemas";

type JainaReportMetricsProps = {
  metrics: FrontendCheckpointReport["performance_snapshot"];
};

export function JainaReportMetrics({ metrics }: JainaReportMetricsProps) {
  if (!metrics || metrics.length === 0) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <Heading size="4" className="text-primary/80">
        Performance Snapshot
      </Heading>
      <Grid columns={{ initial: "1", sm: "2", md: "4" }} gap="4">
        {metrics.map((metric, index) => (
          <MetricCard key={buildMetricKey(metric, index)} item={metric} />
        ))}
      </Grid>
    </div>
  );
}

function buildMetricKey(
  item: FrontendCheckpointReport["performance_snapshot"][number],
  index: number
) {
  const metric = (item ?? {}) as Record<string, unknown>;
  return [
    String(metric.metric ?? metric.label ?? "metric"),
    String(metric.context ?? ""),
    String(metric.sub_label ?? ""),
    String(index),
  ].join("|");
}

function MetricCard({ item }: { item: FrontendCheckpointReport["performance_snapshot"][number] }) {
  const metric = (item ?? {}) as Record<string, unknown>;
  const change = getMetricChange(item);
  const numericChange =
    typeof change === "number" ? change : Number.parseFloat(String(change ?? ""));
  const hasChange = !isNaN(numericChange);
  const hasStatus = typeof metric.status === "string" && metric.status.trim().length > 0;
  const statusColor = resolveMetricStatusColor(metric.status, numericChange, hasChange);

  return (
    <Card className="bg-white/5 border-white/5 hover:bg-white/10 transition-colors">
      <Flex direction="column" gap="1">
        <Text size="1" color="gray" className="uppercase tracking-wider">
          {String(metric.metric ?? metric.label ?? "Metric")}
        </Text>
        <Flex align="center" gap="2">
          <Text size="5" weight="bold" className="text-primary">
            {formatMetricValue(item)}
          </Text>
          {hasChange || hasStatus ? (
            <Badge color={statusColor} variant="soft" className="text-[10px]">
              {hasChange ? (
                <>
                  {numericChange > 0 ? "+" : ""}
                  {numericChange}%
                </>
              ) : (
                formatMetricStatusLabel(metric.status)
              )}
            </Badge>
          ) : null}
        </Flex>
      </Flex>
    </Card>
  );
}

export function getMetricChange(
  item: FrontendCheckpointReport["performance_snapshot"][number]
): unknown {
  const metric = (item ?? {}) as Record<string, unknown>;
  return metric.change ?? metric.trend;
}

export function resolveMetricStatusColor(
  status: unknown,
  numericChange: number,
  hasChange: boolean
): "green" | "red" | "gray" | "blue" | "yellow" {
  const normalizedStatus =
    typeof status === "string" ? status.toLowerCase().trim() : "";

  if (normalizedStatus === "positive" || normalizedStatus === "success") return "green";
  if (normalizedStatus === "risk" || normalizedStatus === "error" || normalizedStatus === "critical") {
    return "red";
  }
  if (normalizedStatus === "warning" || normalizedStatus === "watch") return "yellow";
  if (normalizedStatus === "neutral") return "blue";
  if (hasChange) {
    if (numericChange > 0) return "green";
    if (numericChange < 0) return "red";
    return "blue";
  }
  return "gray";
}

function formatMetricStatusLabel(status: unknown): string {
  if (typeof status !== "string" || status.trim().length === 0) return "neutral";
  const raw = status.trim().toLowerCase();
  if (raw === "risk") return "risk";
  if (raw === "warning") return "warning";
  if (raw === "positive" || raw === "success") return "positive";
  if (raw === "neutral") return "neutral";
  return raw;
}

function formatMetricValue(item: FrontendCheckpointReport["performance_snapshot"][number]) {
  const metric = (item ?? {}) as Record<string, unknown>;
  const value = metric.value;
  const format = typeof metric.format === "string" ? metric.format : undefined;
  const prefix = typeof metric.prefix === "string" ? metric.prefix : undefined;
  const suffix = typeof metric.suffix === "string" ? metric.suffix : undefined;
  if (typeof value !== "number") {
    return String(value ?? "—");
  }

  const resolvedFormat =
    format ||
    (prefix === "$" ? "currency" : undefined) ||
    (suffix === "%" ? "percentage" : undefined);

  let rendered: string;
  if (resolvedFormat === "currency") {
    rendered = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  } else if (resolvedFormat === "percentage") {
    rendered = `${value}%`;
  } else {
    rendered = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  if (prefix && resolvedFormat !== "currency") {
    rendered = `${prefix}${rendered}`;
  }
  if (suffix && !(resolvedFormat === "percentage" && suffix === "%")) {
    rendered = `${rendered}${suffix}`;
  }

  return rendered;
}
