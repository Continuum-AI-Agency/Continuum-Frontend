import { Badge, Card, Callout, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon, Link2Icon } from "@radix-ui/react-icons";
import { PLATFORMS } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";

type Props = {
  summary?: BrandIntegrationSummary;
  showHeader?: boolean;
  isLoading?: boolean;
  onRefresh?: () => Promise<void> | void;
};

function formatConnectionBadge(connectedCount: number): { label: string; color: "green" | "gray" } {
  if (connectedCount > 0) {
    const suffix = connectedCount > 1 ? ` • ${connectedCount}` : "";
    return { label: `Connected${suffix}`, color: "green" };
  }
  return { label: "Not connected", color: "gray" };
}

function resolveStatusColor(status: string | null): "green" | "amber" | "red" | "gray" {
  if (!status) return "gray";
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "selected") return "green";
  if (normalized === "pending") return "amber";
  if (normalized === "error" || normalized === "revoked" || normalized === "disconnected") return "red";
  return "gray";
}

export function BrandIntegrationsCard({ summary, showHeader = true, isLoading = false, onRefresh }: Props) {
  const resolvedSummary = summary ?? ({} as BrandIntegrationSummary);

  return (
    <Flex direction="column" gap="5">
      {showHeader ? (
        <>
          <Heading size="6" className="text-white">
            Integrations
          </Heading>
          <Flex align="center" justify="between" wrap="wrap" gap="3">
            <Text color="gray">
              Review which social and ads accounts are linked to this brand profile. OAuth connections are configured per
              workspace owner; assignments below reflect the accounts currently shared with this brand.
            </Text>
            {onRefresh ? (
              <button
                type="button"
                className="text-sm text-sky-400 hover:text-sky-300 underline"
                onClick={() => onRefresh()}
              >
                Refresh
              </button>
            ) : null}
          </Flex>
        </>
      ) : null}
      <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3">
        {PLATFORMS.map(({ key, label }) => {
          const accounts = resolvedSummary[key]?.accounts ?? [];
          const badge = formatConnectionBadge(accounts.length);

          return (
            <Card key={key} className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
              <Flex direction="column" gap="3" p="4">
                <Flex align="center" justify="between">
                  <Flex align="center" gap="2">
                    <Link2Icon />
                    <Text weight="medium">{label}</Text>
                  </Flex>
                  <Badge color={badge.color}>{badge.label}</Badge>
                </Flex>
                {isLoading ? (
                  <Text color="gray" size="2">
                    Loading connections...
                  </Text>
                ) : accounts.length > 0 ? (
                  <Flex direction="column" gap="1">
                    {accounts.map(account => {
                      const statusColor = resolveStatusColor(account.status);
                      return (
                        <Flex key={account.integrationAccountId} justify="between" align="center">
                      <Text color="gray" size="2" className="truncate">
                        {account.name}
                      </Text>
                          {account.status ? (
                            <Badge color={statusColor} size="1" variant="soft">
                              {account.status}
                            </Badge>
                          ) : null}
                        </Flex>
                      );
                    })}
                  </Flex>
                ) : (
                  <Text color="gray" size="2">
                    No accounts assigned yet.
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })}
      </Grid>
      <Callout.Root color="amber">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          OAuth wiring is in progress. For now, connect providers via the onboarding flow or request access from your
          Continuum partner manager.
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
