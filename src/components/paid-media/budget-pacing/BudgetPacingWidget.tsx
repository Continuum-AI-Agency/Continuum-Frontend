"use client";

import { useState, useEffect, useCallback } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Callout, Flex, IconButton, Select, Text } from "@radix-ui/themes";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";
import type { BudgetPacingResponse } from "@/lib/schemas/budgetPacing";
import { BudgetPacingChart } from "./BudgetPacingChart";
import { BudgetPacingSummaryStrip } from "./BudgetPacingSummaryStrip";
import { BudgetPacingTable } from "./BudgetPacingTable";

type Props = {
  brandId: string;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: BudgetPacingResponse };

function BudgetPacingLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

export function BudgetPacingWidget({ brandId }: Props) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const { integrations, isLoading: integrationsLoading } = useBrandIntegrations(brandId);
  const adAccounts = integrations?.["facebook"]?.accounts ?? [];

  useEffect(() => {
    if (adAccounts.length > 0 && !selectedAccountId) {
      const first = adAccounts[0];
      setSelectedAccountId(first.externalAccountId ?? first.integrationAccountId);
    }
  }, [adAccounts, selectedAccountId]);

  const fetchPacing = useCallback(
    async (accountId: string) => {
      setState({ status: "loading" });
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch("/api/paid-media/budget-pacing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ brandId, adAccountId: accountId }),
        });

        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        const json = await res.json();
        setState({ status: "success", data: json });
      } catch (err) {
        setState({ status: "error", message: (err as Error).message });
      }
    },
    [brandId]
  );

  useEffect(() => {
    if (selectedAccountId) fetchPacing(selectedAccountId);
  }, [selectedAccountId, fetchPacing]);

  return (
    <div className="space-y-4 p-4">
      <Flex align="center" justify="between">
        <div>
          <h3 className="text-sm font-semibold">Budget Pacing</h3>
          <p className="text-xs text-muted-foreground">Campaign spend vs. target</p>
        </div>

        <Flex align="center" gap="2">
          <Select.Root
            value={selectedAccountId ?? ""}
            onValueChange={setSelectedAccountId}
          >
            <Select.Trigger />
            <Select.Content>
              {adAccounts.map((account) => (
                <Select.Item
                  key={account.integrationAccountId}
                  value={account.externalAccountId ?? account.integrationAccountId}
                >
                  {account.name || account.integrationAccountId}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>

          <IconButton
            variant="ghost"
            size="1"
            disabled={state.status === "loading" || !selectedAccountId}
            onClick={() => {
              if (selectedAccountId) fetchPacing(selectedAccountId);
            }}
          >
            <ReloadIcon />
          </IconButton>
        </Flex>
      </Flex>

      {state.status === "loading" && <BudgetPacingLoadingSkeleton />}

      {state.status === "error" && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{state.message}</Callout.Text>
        </Callout.Root>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          <BudgetPacingSummaryStrip data={state.data} />
          <BudgetPacingChart campaigns={state.data.campaigns} />
          <BudgetPacingTable campaigns={state.data.campaigns} />
        </div>
      )}

      {state.status === "idle" &&
        adAccounts.length === 0 &&
        !integrationsLoading && (
          <Text size="2" color="gray" align="center" as="p" className="py-8">
            No Meta ad accounts connected.
          </Text>
        )}
    </div>
  );
}
