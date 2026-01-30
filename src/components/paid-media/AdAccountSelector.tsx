
"use client";

import * as React from "react";
import { Select, Callout, Text, Flex } from "@radix-ui/themes";
import { useToast } from "@/components/ui/ToastProvider";
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

  const adAccounts = React.useMemo(() => {
    if (!integrations) return [];
    const facebookAccounts = integrations.facebook?.accounts ?? [];
    return facebookAccounts.map((acc) => ({
      id: acc.externalAccountId ?? acc.integrationAccountId,
      name: acc.name,
    }));
  }, [integrations]);

  // Auto-select first account if none selected
  React.useEffect(() => {
    if (!selectedAccountId && adAccounts.length > 0) {
      onSelect(adAccounts[0].id);
    }
  }, [selectedAccountId, adAccounts, onSelect]);

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
