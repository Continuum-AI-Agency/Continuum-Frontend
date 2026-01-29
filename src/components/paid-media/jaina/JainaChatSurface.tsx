"use client";

import React from "react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  ScrollArea,
  Select,
  Text,
} from "@radix-ui/themes";
import { Cross2Icon, ResetIcon, RocketIcon } from "@radix-ui/react-icons";

import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useJainaChatStream } from "@/hooks/useJainaChatStream";
import { JainaChatComposer } from "./JainaChatComposer";
import { JainaMessageList } from "./JainaMessageList";
import { JainaReportView } from "./JainaReportView";
import { JainaTracePanel } from "./JainaTracePanel";
import type { JainaChatMessage } from "./types";
import type { JainaChatInputValues } from "@/lib/jaina/schemas";
import { cn } from "@/lib/utils";

type AdAccount = {
  id: string;
  name: string;
};

type JainaChatSurfaceProps = {
  brandProfileId: string;
  brandName: string;
};

export function JainaChatSurface({ brandProfileId, brandName }: JainaChatSurfaceProps) {
  const { show } = useToast();
  const { state, start, cancel, reset, clearMemory } = useJainaChatStream();
  const supabase = createSupabaseBrowserClient();

  const [messages, setMessages] = React.useState<JainaChatMessage[]>([]);
  const [activeResponseId, setActiveResponseId] = React.useState<string | null>(null);
  const [adAccounts, setAdAccounts] = React.useState<AdAccount[]>([]);
  const [selectedAdAccount, setSelectedAdAccount] = React.useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = React.useState(false);
  const [accountsError, setAccountsError] = React.useState<string | null>(null);

  const progressLabel = React.useMemo(() => {
    if (!state.progress.length) return null;
    const last = state.progress[state.progress.length - 1];
    return last.detail ?? last.stage;
  }, [state.progress]);

  const updateMessage = React.useCallback((id: string, update: Partial<JainaChatMessage>) => {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, ...update } : msg)));
  }, []);

  const loadAdAccounts = React.useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        throw new Error("No authentication token available");
      }

      const response = await fetch(`/api/ad-accounts?brandId=${encodeURIComponent(brandProfileId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load ad accounts.");
      }

      const payload = (await response.json()) as { accounts?: AdAccount[] };
      const accounts = payload.accounts ?? [];
      setAdAccounts(accounts);
      if (!selectedAdAccount && accounts.length > 0) {
        setSelectedAdAccount(accounts[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load ad accounts.";
      setAccountsError(message);
    } finally {
      setAccountsLoading(false);
    }
  }, [brandProfileId, selectedAdAccount, supabase]);

  React.useEffect(() => {
    void loadAdAccounts();
  }, [loadAdAccounts]);

  React.useEffect(() => {
    if (!activeResponseId) return;
    if (state.status === "complete" && state.report) {
      updateMessage(activeResponseId, {
        status: "done",
        content: state.report.executive_summary,
      });
      setActiveResponseId(null);
    }
    if (state.status === "error" && state.error) {
      updateMessage(activeResponseId, {
        status: "error",
        content: state.error,
        title: "Jaina error",
      });
      setActiveResponseId(null);
    }
  }, [activeResponseId, state.status, state.report, state.error, updateMessage]);

  const handleSubmit = React.useCallback(
    async (values: JainaChatInputValues) => {
      if (!selectedAdAccount) {
        show({ title: "Select an ad account", description: "Jaina needs an ad account context.", variant: "warning" });
        return;
      }

      const now = new Date().toISOString();
      const userMessage: JainaChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: values.query,
        createdAt: now,
      };
      const assistantMessage: JainaChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Building your paid media report…",
        createdAt: now,
        status: "streaming",
        title: "Jaina Analyst",
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setActiveResponseId(assistantMessage.id);

      const result = await start({
        query: values.query,
        adAccountId: selectedAdAccount,
        brandId: brandProfileId,
      });

      if (result.error) {
        show({ title: "Stream failed", description: result.error, variant: "error" });
      }
    },
    [brandProfileId, selectedAdAccount, show, start]
  );

  const handleClearConversation = React.useCallback(() => {
    reset();
    setMessages([]);
    setActiveResponseId(null);
  }, [reset]);

  const handleClearMemory = React.useCallback(async () => {
    if (!selectedAdAccount) {
      show({ title: "Select an ad account", description: "Choose an ad account before clearing memory.", variant: "warning" });
      return;
    }
    try {
      await clearMemory(selectedAdAccount);
      show({ title: "Memory cleared", description: "Jaina will start fresh for this ad account.", variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to clear memory.";
      show({ title: "Clear failed", description: message, variant: "error" });
    }
  }, [clearMemory, selectedAdAccount, show]);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.12),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.16),transparent_50%)]" />

      <div className="relative z-[1] flex h-full min-h-0 flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Flex align="center" gap="2">
              <Badge color="purple" variant="soft">
                <RocketIcon />
              </Badge>
              <Heading size="6">Paid Media · Jaina</Heading>
            </Flex>
            <Text color="gray">
              Streaming performance intelligence for <span className="text-primary">{brandName}</span>
            </Text>
          </div>

          <Flex align="center" gap="2" wrap="wrap">
            <Select.Root
              value={selectedAdAccount ?? ""}
              onValueChange={setSelectedAdAccount}
              disabled={accountsLoading || adAccounts.length === 0}
            >
              <Select.Trigger variant="surface" radius="large" className="min-w-[220px]">
                {accountsLoading
                  ? "Loading ad accounts…"
                  : selectedAdAccount
                    ? adAccounts.find((account) => account.id === selectedAdAccount)?.name ?? "Ad account"
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

            <Button variant="soft" color="gray" onClick={handleClearMemory}>
              <ResetIcon />
              Reset Memory
            </Button>
            <Button variant="soft" color="gray" onClick={handleClearConversation}>
              <Cross2Icon />
              Clear Chat
            </Button>
            <Button
              variant={state.status === "streaming" ? "solid" : "soft"}
              color={state.status === "streaming" ? "red" : "gray"}
              onClick={state.status === "streaming" ? cancel : handleClearConversation}
            >
              {state.status === "streaming" ? "Stop" : "Idle"}
            </Button>
          </Flex>
        </header>

        {accountsError ? (
          <Callout.Root color="red" variant="surface">
            <Callout.Text>{accountsError}</Callout.Text>
          </Callout.Root>
        ) : null}

        <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex-1 min-h-0">
              <JainaMessageList
                messages={messages}
                isStreaming={state.status === "streaming"}
                progressLabel={progressLabel}
              />
            </div>

            <Card className={cn("border border-subtle bg-surface", state.status === "streaming" && "shadow-brand-glow")}>
              <Box p="4">
                <JainaChatComposer
                  onSubmit={handleSubmit}
                  isStreaming={state.status === "streaming"}
                  disabled={!selectedAdAccount}
                  suggestions={[
                    "Which creatives improved ROAS week-over-week?",
                    "Summarize spend shifts and recommend budget moves.",
                    "What audiences are declining and need new tests?",
                  ]}
                />
              </Box>
            </Card>
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            <Card className="flex-1 min-h-0 border border-subtle bg-surface">
              <ScrollArea type="always" scrollbars="vertical" className="h-full min-h-0">
                <Box p="4">
                  <JainaReportView report={state.report} status={state.status} error={state.error} />
                </Box>
              </ScrollArea>
            </Card>

            <div className="min-h-[260px]">
              <JainaTracePanel
                progress={state.progress}
                toolCalls={state.toolCalls}
                toolResults={state.toolResults}
                stateDeltas={state.stateDeltas}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
