"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Tabs, Text } from "@radix-ui/themes";
import { parseBrandMd } from "@continuum/contracts";
import { saveBrandMd, resetBrandMd } from "@/lib/api/brandBook.client";
import { useToast } from "@/components/ui/ToastProvider";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { useBrandMdDirty } from "./BrandMdDirtyContext";

type Props = {
  brandId: string;
  // Null when brand.md has not been generated yet (un-migrated brand).
  initialBrandMd: string | null;
  isEdited: boolean;
};

// Raw textarea + live preview editor for brand.md (YAML front matter + prose body).
// Front-matter validity is derived via parseBrandMd and shown as a non-blocking hint.
// Save/reset write through saveBrandMd / resetBrandMd and then router.refresh() so
// the parent RSC re-fetches the updated envelope.
export function BrandMdEditor({ brandId, initialBrandMd, isEdited }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const { setDirty } = useBrandMdDirty();

  const [draft, setDraft] = useState(initialBrandMd ?? "");
  const [isPending, startTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();

  // Track whether the current draft differs from the last-saved value.
  const savedRef = useRef(initialBrandMd ?? "");
  const dirty = draft !== savedRef.current;

  // Keep the context dirty flag in sync so BrandBookActions can suppress refresh.
  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  // When the parent RSC refreshes (e.g. after a reset), re-sync local draft.
  useEffect(() => {
    const next = initialBrandMd ?? "";
    savedRef.current = next;
    setDraft(next);
  }, [initialBrandMd]);

  const parsed = parseBrandMd(draft);
  const frontMatterValid = parsed.tokens !== null;
  // If there is no front-matter fence at all, show "not present" rather than "invalid".
  const hasFrontMatter = draft.trimStart().startsWith("---");

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await saveBrandMd(brandId, draft);
        const saved = result.brand_md ?? draft;
        savedRef.current = saved;
        setDraft(saved);
        setDirty(false);
        show({ title: "Brand document saved", variant: "success" });
        router.refresh();
      } catch (e) {
        show({
          title: "Save failed",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "error",
        });
      }
    });
  };

  const handleReset = () => {
    startResetTransition(async () => {
      try {
        const result = await resetBrandMd(brandId);
        const next = result.brand_md ?? "";
        savedRef.current = next;
        setDraft(next);
        setDirty(false);
        show({ title: "Reverted to generated document", variant: "success" });
        router.refresh();
      } catch (e) {
        show({
          title: "Revert failed",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "error",
        });
      }
    });
  };

  if (initialBrandMd === null) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-6 text-center space-y-2">
        <Text size="2" color="gray">
          No brand document generated yet.
        </Text>
        <Text size="1" color="gray" as="p">
          Run "Deepen analysis" to generate your brand.md, then return here to edit.
        </Text>
      </div>
    );
  }

  const isBusy = isPending || isResetting;

  return (
    <div className="space-y-3">
      {/* Header row: title + badges + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Text size="2" weight="medium" className="text-gray-200">
            brand.md
          </Text>
          {isEdited && !dirty ? (
            <Badge color="amber" variant="soft" radius="full">
              Edited
            </Badge>
          ) : null}
          {dirty ? (
            <Badge color="blue" variant="soft" radius="full">
              Unsaved changes
            </Badge>
          ) : null}
          {hasFrontMatter ? (
            <Badge
              color={frontMatterValid ? "green" : "red"}
              variant="soft"
              radius="full"
            >
              front matter: {frontMatterValid ? "valid" : "invalid"}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isEdited ? (
            <Button
              onClick={handleReset}
              disabled={isBusy}
              variant="ghost"
              size="1"
              color="gray"
            >
              {isResetting ? "Reverting…" : "Revert to generated"}
            </Button>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={isBusy || !dirty}
            variant="soft"
            size="2"
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Tab: Edit | Preview */}
      <Tabs.Root defaultValue="edit">
        <Tabs.List>
          <Tabs.Trigger value="edit">Edit</Tabs.Trigger>
          <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="edit" className="pt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={24}
            spellCheck={false}
            className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-gray-200 resize-y focus:outline-none focus:ring-1 focus:ring-white/20"
            aria-label="brand.md editor"
          />
        </Tabs.Content>

        <Tabs.Content value="preview" className="pt-3">
          <div className="min-h-[200px] rounded-md border border-white/10 bg-black/20 px-4 py-3">
            {parsed.body.trim() ? (
              <SafeMarkdown
                content={parsed.body}
                mode="static"
                className="prose prose-invert prose-sm max-w-none"
              />
            ) : (
              <Text size="2" color="gray">
                Nothing to preview yet.
              </Text>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
