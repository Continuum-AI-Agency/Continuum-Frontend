
"use client";

import * as React from "react";
import { Select, Callout } from "@radix-ui/themes";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";

type AdAccount = {
  id: string;
  name: string;
};

type AdAccountSelectorProps = {
  brandId: string;
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
};

export function AdAccountSelector({
  brandId,
  selectedAccountId,
  onSelect,
}: AdAccountSelectorProps) {
  const { integrations, isLoading, isError } = useBrandIntegrations(brandId);
  const [timelineAccounts, setTimelineAccounts] = React.useState<AdAccount[]>([]);
  const [timelineAccountsLoaded, setTimelineAccountsLoaded] = React.useState(false);

  const adAccounts = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: AdAccount[] = [];

    timelineAccounts.forEach((account) => {
      if (seen.has(account.id)) return;
      seen.add(account.id);
      merged.push(account);
    });

    if (!integrations) return merged;
    const facebookAccounts = integrations.facebook?.accounts ?? [];
    facebookAccounts.forEach((account) => {
      const id = account.externalAccountId ?? account.integrationAccountId;
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push({
        id,
        name: account.name,
      });
    });

    return merged;
  }, [integrations, timelineAccounts]);

  React.useEffect(() => {
    let isCancelled = false;
    setTimelineAccountsLoaded(false);
    setTimelineAccounts([]);

    const fetchTimelineAccounts = async () => {
      try {
        const response = await fetch("/api/paid-media/timeline/accounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ brandId }),
          cache: "no-store",
        });

        if (!response.ok) {
          if (!isCancelled) {
            setTimelineAccountsLoaded(true);
          }
          return;
        }

        const payload = (await response.json()) as { accounts?: AdAccount[] };
        const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
        if (!isCancelled) {
          setTimelineAccounts(accounts);
          setTimelineAccountsLoaded(true);
        }
      } catch {
        if (!isCancelled) {
          setTimelineAccounts([]);
          setTimelineAccountsLoaded(true);
        }
      }
    };

    void fetchTimelineAccounts();

    return () => {
      isCancelled = true;
    };
  }, [brandId]);

  // Auto-select first account if none selected
  React.useEffect(() => {
    if (!timelineAccountsLoaded) return;
    if (!selectedAccountId && adAccounts.length > 0) {
      onSelect(adAccounts[0].id);
    }
  }, [timelineAccountsLoaded, selectedAccountId, adAccounts, onSelect]);

  if (isError) {
    return (
      <Callout.Root color="red" variant="surface" size="1">
        <Callout.Text>Error loading accounts</Callout.Text>
      </Callout.Root>
    );
  }

  return (
    <Select.Root
      value={selectedAccountId ?? ""}
      onValueChange={onSelect}
      disabled={isLoading || adAccounts.length === 0}
    >
      <Select.Trigger variant="surface" radius="large" className="min-w-[220px]">
        {isLoading
          ? "Loading ad accounts…"
          : selectedAccountId
          ? adAccounts.find((a) => a.id === selectedAccountId)?.name ?? "Ad account"
          : "Select ad account"}
      </Select.Trigger>
      <Select.Content>
        {adAccounts.length === 0 ? (
          <Select.Item value="none" disabled>
            No ad accounts
          </Select.Item>
        ) : (
          adAccounts.map((account) => (
            <Select.Item key={account.id} value={account.id}>
              {account.name}
            </Select.Item>
          ))
        )}
      </Select.Content>
    </Select.Root>
  );
}
