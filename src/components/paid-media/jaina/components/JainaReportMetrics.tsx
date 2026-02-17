import { Card, Flex, Grid, Text, Badge, Heading } from "@radix-ui/themes";
import { type SoTReport } from "@/lib/jaina/schemas";

type JainaReportMetricsProps = {
  metrics: SoTReport["performance_snapshot"];
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
  item: SoTReport["performance_snapshot"][number],
  index: number
) {
  return [
    item.metric || "metric",
    item.context || "",
    item.sub_label || "",
    String(index),
  ].join("|");
}

function MetricCard({ item }: { item: SoTReport["performance_snapshot"][number] }) {
  const numericChange = typeof item.change === 'number' ? item.change : parseFloat(item.change as string);
  const hasChange = !isNaN(numericChange);
  
  const isPositive = item.status === "positive" || (hasChange && numericChange > 0);
  const isNegative = item.status === "risk" || (hasChange && numericChange < 0);

  let statusColor: "green" | "red" | "gray" | "blue" = "gray";
  if (isPositive) statusColor = "green";
  if (isNegative) statusColor = "red";
  if (item.status === "neutral") statusColor = "blue";

  return (
    <Card className="bg-white/5 border-white/5 hover:bg-white/10 transition-colors">
      <Flex direction="column" gap="1">
        <Text size="1" color="gray" className="uppercase tracking-wider">
          {item.metric}
        </Text>
        <Flex align="center" gap="2">
          <Text size="5" weight="bold" className="text-primary">
            {formatMetricValue(item)}
          </Text>
          {hasChange ? (
            <Badge color={statusColor} variant="soft" className="text-[10px]">
              {numericChange > 0 ? "+" : ""}
              {numericChange}%
            </Badge>
          ) : null}
        </Flex>
      </Flex>
    </Card>
  );
}

function formatMetricValue(item: SoTReport["performance_snapshot"][number]) {
  const { value, format, prefix, suffix } = item;
  if (typeof value !== "number") {
    return value;
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
