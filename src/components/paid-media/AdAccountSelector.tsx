
"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Callout } from "@radix-ui/themes";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";
import { cn } from "@/lib/utils";

export type AdAccount = {
  id: string;
  name: string;
};

type AdAccountSelectorProps = {
  brandId: string;
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  /** Server-provided initial accounts to avoid a client-side fetch waterfall. */
  initialTimelineAccounts?: AdAccount[];
};

export function AdAccountSelector({
  brandId,
  selectedAccountId,
  onSelect,
  initialTimelineAccounts,
}: AdAccountSelectorProps) {
  const { integrations, isLoading, isError } = useBrandIntegrations(brandId);
  const [open, setOpen] = React.useState(false);
  const hasInitialAccounts = initialTimelineAccounts && initialTimelineAccounts.length > 0;
  const [timelineAccounts, setTimelineAccounts] = React.useState<AdAccount[]>(
    initialTimelineAccounts ?? []
  );
  const [timelineAccountsLoaded, setTimelineAccountsLoaded] = React.useState(
    hasInitialAccounts ?? false
  );

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

  const initialAccountsUsedRef = React.useRef(hasInitialAccounts);

  React.useEffect(() => {
    // Skip client-side fetch on first render when server-provided data exists
    if (initialAccountsUsedRef.current) {
      initialAccountsUsedRef.current = false;
      return;
    }

    let isCancelled = false;
    setTimelineAccountsLoaded(false);
    setTimelineAccounts([]);

    const fetchAccounts = async () => {
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

    void fetchAccounts();

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

  const selectedAccount = selectedAccountId
    ? adAccounts.find((account) => account.id === selectedAccountId)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading || adAccounts.length === 0}
          className="h-8 min-w-[240px] justify-between text-xs font-normal"
        >
          {isLoading
            ? "Loading ad accounts…"
            : selectedAccount
              ? selectedAccount.name
              : "Select ad account"}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ad accounts..." className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No ad accounts found.</CommandEmpty>
            <CommandGroup heading="Ad accounts">
              {adAccounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.name} ${account.id}`}
                  keywords={[account.id]}
                  onSelect={() => {
                    onSelect(account.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-1.5 h-3.5 w-3.5",
                      selectedAccountId === account.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate text-xs">{account.name}</span>
                  <span className="ml-auto truncate text-[10px] text-muted-foreground">{account.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
