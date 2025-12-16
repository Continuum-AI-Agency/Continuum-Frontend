"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDownIcon, InstagramLogoIcon } from "@radix-ui/react-icons";
import {
  Badge,
  Box,
  Callout,
  Card,
  DataList,
  Flex,
  Grid,
  Heading,
  IconButton,
  Select,
  Spinner,
  Text,
} from "@radix-ui/themes";
import React from "react";

import { fetchInstagramOrganicMetrics } from "@/lib/api/organicMetrics.client";
import type { InstagramOrganicMetricsResponse, OrganicDateRangePreset } from "@/lib/schemas/organicMetrics";

export type InstagramAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type Props = {
  brandId: string;
  accounts: InstagramAccountOption[];
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: InstagramOrganicMetricsResponse };

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = "last_7d";

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function rangeLabel(preset: OrganicDateRangePreset) {
  return preset.replaceAll("_", " ");
}

export function InstagramOrganicReportingWidget({ brandId, accounts }: Props) {
  const firstAccountId = accounts[0]?.integrationAccountId ?? null;
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(firstAccountId);
  const [accordionValue, setAccordionValue] = React.useState<string>("");
  const [state, setState] = React.useState<LoadState>({ status: "idle" });

  const selectedAccount = accounts.find((account) => account.integrationAccountId === selectedAccountId) ?? null;
  const isExpanded = accordionValue === "details";

  React.useEffect(() => {
    const accountId = selectedAccountId;
    if (!accountId) return;
    let cancelled = false;

    async function run() {
      setState({ status: "loading" });
      try {
        const data = await fetchInstagramOrganicMetrics({
          brandId,
          integrationAccountId: accountId,
          range: { preset: DEFAULT_RANGE_PRESET },
        });
        if (cancelled) return;
        setState({ status: "success", data });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load Instagram organic metrics.";
        setState({ status: "error", message });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [brandId, selectedAccountId]);

  return (
    <Card
      variant="surface"
      style={{
        backgroundColor: "var(--muted)",
        border: "1px solid var(--border)",
        color: "var(--foreground)",
      }}
    >
      <Box p="3">
        <Accordion.Root
          type="single"
          collapsible
          value={accordionValue}
          onValueChange={setAccordionValue}
        >
          <Accordion.Item value="details">
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <Flex align="center" gap="2">
                <Badge color="gray" variant="soft" radius="full">
                  <InstagramLogoIcon />
                </Badge>
                <Flex direction="column" gap="1">
                  <Text weight="medium">Instagram organic reporting</Text>
                  <Text color="gray" size="2">{rangeLabel(DEFAULT_RANGE_PRESET)}</Text>
                </Flex>
              </Flex>

              <Flex align="center" gap="2">
                <Select.Root
                  value={selectedAccountId ?? ""}
                  onValueChange={(value) => setSelectedAccountId(value)}
                >
                  <Select.Trigger variant="surface" radius="large">
                    {selectedAccount?.name ?? "Select an Instagram account"}
                  </Select.Trigger>
                  <Select.Content position="popper" variant="solid" highContrast>
                    <Select.Group>
                      <Select.Label>Instagram accounts</Select.Label>
                      {accounts.map((account) => (
                        <Select.Item key={account.integrationAccountId} value={account.integrationAccountId}>
                          {account.name}
                        </Select.Item>
                      ))}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>

                <Accordion.Header>
                  <Accordion.Trigger asChild>
                    <IconButton
                      aria-label={isExpanded ? "Collapse organic reporting" : "Expand organic reporting"}
                      variant="soft"
                      color="gray"
                    >
                      <ChevronDownIcon
                        style={{
                          transition: "transform 150ms ease",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    </IconButton>
                  </Accordion.Trigger>
                </Accordion.Header>
              </Flex>
            </Flex>

            <Box pt="3">
              {accounts.length === 0 ? (
                <Text color="gray" size="2">
                  No Instagram accounts are linked to this brand profile.
                </Text>
              ) : state.status === "error" ? (
                <Callout.Root color="red" variant="surface">
                  <Callout.Text>{state.message}</Callout.Text>
                </Callout.Root>
              ) : state.status === "loading" ? (
                <Flex align="center" gap="2">
                  <Spinner size="2" />
                  <Text color="gray" size="2">Loading metrics…</Text>
                </Flex>
              ) : state.status === "success" ? (
                <MetricsBody data={state.data} expanded={isExpanded} />
              ) : (
                <Text color="gray" size="2">
                  Select an Instagram account to view organic reporting.
                </Text>
              )}
            </Box>

            <Accordion.Content>
              <Box pt="3">
                {state.status === "success" ? <ExpandedDetails data={state.data} /> : null}
              </Box>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      </Box>
    </Card>
  );
}

function MetricsBody({ data, expanded }: { data: InstagramOrganicMetricsResponse; expanded: boolean }) {
  const { metrics } = data;

  const headline = [
    { label: "Reach", value: formatNumber(metrics.reach) },
    { label: "Views", value: formatNumber(metrics.views) },
    { label: "New followers", value: formatNumber(metrics.newFollowers) },
  ];

  const headlineGrid = (
    <Grid columns={{ initial: "1", sm: "3" }} gap="3">
      {headline.map((item) => (
        <Card key={item.label} variant="classic">
          <Flex direction="column" gap="1" p="3">
            <Text color="gray" size="2">{item.label}</Text>
            <Heading size="5">{item.value}</Heading>
          </Flex>
        </Card>
      ))}
    </Grid>
  );

  if (!expanded) {
    return (
      <Flex direction="column" gap="3">
        {headlineGrid}
        <Text color="gray" size="2">Expand to see the full breakdown.</Text>
      </Flex>
    );
  }

  const secondary = [
    { label: "Accounts engaged", value: formatNumber(metrics.accountsEngaged) },
    { label: "Reels views", value: formatNumber(metrics.reelsViews) },
    { label: "Post views", value: formatNumber(metrics.postViews) },
    { label: "Stories views", value: formatNumber(metrics.storiesViews) },
  ];

  return (
    <Flex direction="column" gap="3">
      {headlineGrid}
      <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="3">
        {secondary.map((item) => (
          <Card key={item.label} variant="classic">
            <Flex direction="column" gap="1" p="3">
              <Text color="gray" size="2">{item.label}</Text>
              <Heading size="5">{item.value}</Heading>
            </Flex>
          </Card>
        ))}
      </Grid>
    </Flex>
  );
}

function ExpandedDetails({ data }: { data: InstagramOrganicMetricsResponse }) {
  const { metrics, range, accountId } = data;

  return (
    <Flex direction="column" gap="3">
      <Heading size="4">Details</Heading>
      <Grid columns={{ initial: "1", sm: "2" }} gap="3">
        <Card variant="classic">
          <Box p="3">
            <DataList.Root orientation="vertical">
              <DataList.Item>
                <DataList.Label color="gray">Range</DataList.Label>
                <DataList.Value>{rangeLabel(range.preset)}</DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label color="gray">Window</DataList.Label>
                <DataList.Value>
                  {range.since} → {range.until}
                </DataList.Value>
              </DataList.Item>
              {range.adjusted ? (
                <DataList.Item>
                  <DataList.Label color="gray">Adjusted</DataList.Label>
                  <DataList.Value>
                    {range.adjusted.since} ({range.adjusted.reason})
                  </DataList.Value>
                </DataList.Item>
              ) : null}
              <DataList.Item>
                <DataList.Label color="gray">Account ID</DataList.Label>
                <DataList.Value>{accountId}</DataList.Value>
              </DataList.Item>
            </DataList.Root>
          </Box>
        </Card>

        <Card variant="classic">
          <Box p="3">
            <DataList.Root orientation="vertical">
              <DataList.Item>
                <DataList.Label color="gray">Non-follower reach</DataList.Label>
                <DataList.Value>{formatNumber(metrics.nonFollowerReach)}</DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label color="gray">Follower reach</DataList.Label>
                <DataList.Value>{formatNumber(metrics.followerReach)}</DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label color="gray">Profile visits (yesterday)</DataList.Label>
                <DataList.Value>{formatNumber(metrics.profileVisitsYesterday)}</DataList.Value>
              </DataList.Item>
            </DataList.Root>
          </Box>
        </Card>
      </Grid>
    </Flex>
  );
}
