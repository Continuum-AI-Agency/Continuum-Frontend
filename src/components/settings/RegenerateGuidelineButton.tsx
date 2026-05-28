"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/ToastProvider";
import { regenerateBrandGuidelineAction } from "@/app/(post-auth)/settings/actions";

type RegenerateGuidelineButtonProps = {
  brandId: string;
  disabled?: boolean;
  blockReason?: string | null;
};

export function RegenerateGuidelineButton({
  brandId,
  disabled,
  blockReason,
}: RegenerateGuidelineButtonProps) {
  const [pending, startTransition] = useTransition();
  const [, setLastError] = useState<string | null>(null);
  const { show } = useToast();

  const handleClick = () => {
    startTransition(async () => {
      try {
        const result = await regenerateBrandGuidelineAction(brandId);
        if (result.skipped) {
          show({
            title: "Already up to date",
            description: "A guideline already exists; no changes made.",
            variant: "success",
          });
        } else {
          show({
            title: "Guideline regenerated",
            description: result.version ? `Version ${result.version} created.` : "Done.",
            variant: "success",
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to regenerate";
        setLastError(message);
        show({ title: "Regenerate failed", description: message, variant: "error" });
      }
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      onClick={handleClick}
      title={blockReason ?? "Regenerate brand guideline"}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
      )}
      Regenerate
    </Button>
  );
}
