/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Heading, Text, Tabs } from "@radix-ui/themes";
import { useToast } from "@/components/ui/ToastProvider";
import { CreativeLibrarySidebar } from "@/components/creative-assets/CreativeLibrarySidebar";
import { BrandSwitcherMenu } from "@/components/navigation/BrandSwitcherMenu";
import { ChatSurface } from "@/components/ai-studio/chat/ChatSurface";
import {
  createPromptTemplateAction,
  deletePromptTemplateAction,
  updatePromptTemplateAction,
} from "./actions";
import type {
  PromptTemplateCreateInput,
  PromptTemplateUpdateInput,
} from "@/lib/schemas/promptTemplates";
import { StudioCanvas } from "@/StudioCanvas";
import { useSearchParams, useRouter } from "next/navigation";

type AIStudioClientProps = {
  brandProfileId: string;
  brandName: string;
  promptTemplates?: import("@/lib/schemas/promptTemplates").PromptTemplate[];
};

export default function AIStudioClient({
  brandProfileId,
  brandName,
  promptTemplates,
}: AIStudioClientProps) {
  const { show: showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const mode = searchParams.get("mode") as "chat" | "canvas" | null;
  const activeTab = mode === "canvas" ? "canvas" : "chat";

  const setActiveTab = (tab: "chat" | "canvas") => {
    const params = new URLSearchParams(searchParams);
    params.set("mode", tab);
    router.replace(`?${params.toString()}`);
  };

  const [templates, setTemplates] = React.useState(promptTemplates ?? []);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);

  const handleCreateTemplate = React.useCallback(
    async (input: Omit<PromptTemplateCreateInput, "brandProfileId">) => {
      setTemplatesLoading(true);
      try {
        const created = await createPromptTemplateAction({
          brandProfileId,
          name: input.name,
          prompt: input.prompt,
          category: input.category,
        });
        setTemplates((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        showToast({ title: "Template saved", variant: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save template";
        showToast({ title: "Save failed", description: message, variant: "error" });
        throw error;
      } finally {
        setTemplatesLoading(false);
      }
    },
    [brandProfileId, showToast]
  );

  const handleUpdateTemplate = React.useCallback(
    async (input: PromptTemplateUpdateInput) => {
      setTemplatesLoading(true);
      try {
        const updated = await updatePromptTemplateAction(input);
        setTemplates((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
        showToast({ title: "Template updated", variant: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update template";
        showToast({ title: "Update failed", description: message, variant: "error" });
        throw error;
      } finally {
        setTemplatesLoading(false);
      }
    },
    [showToast]
  );

  const handleDeleteTemplate = React.useCallback(
    async (id: string) => {
      setTemplatesLoading(true);
      try {
        await deletePromptTemplateAction(id);
        setTemplates((prev) => prev.filter((item) => item.id !== id));
        showToast({ title: "Template deleted", variant: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to delete template";
        showToast({ title: "Delete failed", description: message, variant: "error" });
        throw error;
      } finally {
        setTemplatesLoading(false);
      }
    },
    [showToast]
  );

  return (
    <div className="fixed inset-x-0 top-0 h-screen h-[100dvh] md:left-[var(--app-sidebar-width,88px)] isolate flex flex-col overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(10,12,24,0.95) 0%,rgba(10,12,24,0.98) 50%,rgba(7,9,18,1) 100%)]" />

      <main className="relative z-[1] flex flex-1 flex-col gap-3 px-6 sm:px-10 md:px-16 pt-4 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <Heading size="7" className="text-white">AI Studio</Heading>
            <Text color="gray">Build flows for {brandName}</Text>
          </div>
          <div className="flex items-center gap-3">
            <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "canvas")} activationMode="manual">
              <Tabs.List>
                <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
                <Tabs.Trigger value="canvas">Canvas</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
            <BrandSwitcherMenu />
          </div>
        </div>

        {activeTab === "chat" ? (
          <div className="flex-1 min-h-0">
            <ChatSurface
              brandProfileId={brandProfileId}
              brandName={brandName}
              promptTemplates={templates}
              templatesLoading={templatesLoading}
              onCreatePromptTemplate={handleCreateTemplate}
              onUpdatePromptTemplate={handleUpdateTemplate}
              onDeletePromptTemplate={handleDeleteTemplate}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            <StudioCanvas embedded brandProfileId={brandProfileId} />
          </div>
        )}
      </main>

      <CreativeLibrarySidebar brandProfileId={brandProfileId} />
    </div>
  );
}
