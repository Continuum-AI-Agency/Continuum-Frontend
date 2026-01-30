
"use client";

import * as React from "react";
import { Select, Callout } from "@radix-ui/themes";
import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const { show } = useToast();
  const supabase = createSupabaseBrowserClient();

  const [adAccounts, setAdAccounts] = React.useState<AdAccount[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function loadAccounts() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          throw new Error("No authentication token available");
        }

        const response = await fetch(
          `/api/ad-accounts?brandId=${encodeURIComponent(brandId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load ad accounts.");
        }

        const payload = (await response.json()) as { accounts?: AdAccount[] };
        const accounts = payload.accounts ?? [];
        
        if (mounted) {
          setAdAccounts(accounts);
          // Auto-select first account if none selected
          if (!selectedAccountId && accounts.length > 0) {
            onSelect(accounts[0].id);
          }
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : "Unable to load ad accounts.";
          setError(message);
          show({
            title: "Error",
            description: message,
            variant: "error",
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, selectedAccountId]);

  if (error) {
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
      disabled={loading || adAccounts.length === 0}
    >
      <Select.Trigger variant="surface" radius="large" className="min-w-[220px]">
        {loading
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
