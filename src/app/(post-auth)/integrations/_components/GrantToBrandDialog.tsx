"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { grantIntegrationToBrandAction } from "@/app/(post-auth)/settings/integrations/actions";

type GrantToBrandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  integrationLabel: string;
  alreadyGrantedBrandIds?: ReadonlySet<string>;
};

type EligibleBrand = {
  id: string;
  name: string;
};

export function GrantToBrandDialog({
  open,
  onOpenChange,
  integrationId,
  integrationLabel,
  alreadyGrantedBrandIds,
}: GrantToBrandDialogProps) {
  const router = useRouter();
  const { brandSummaries, permissions } = useActiveBrandContext();
  const { show } = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const eligibleBrands: EligibleBrand[] = React.useMemo(() => {
    const ownerOrAdminBrandIds = new Set(
      permissions
        .filter((p) => p.role === "owner" || p.role === "admin")
        .map((p) => p.brand_profile_id),
    );

    return brandSummaries
      .filter((brand) => !brand.isPending)
      .filter((brand) => ownerOrAdminBrandIds.has(brand.id))
      .map((brand) => ({ id: brand.id, name: brand.name }));
  }, [brandSummaries, permissions]);

  React.useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  const toggle = (brandId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      onOpenChange(false);
      return;
    }
    setIsSubmitting(true);
    const ids = Array.from(selected);
    const failures: string[] = [];

    await Promise.all(
      ids.map(async (brandId) => {
        try {
          await grantIntegrationToBrandAction(brandId, integrationId);
        } catch (error) {
          const brandName = eligibleBrands.find((b) => b.id === brandId)?.name ?? brandId;
          failures.push(brandName);
          if (process.env.NODE_ENV !== "production") {
            console.error(`[GrantToBrandDialog] grant failed for ${brandId}`, error);
          }
        }
      }),
    );

    setIsSubmitting(false);

    if (failures.length === 0) {
      show({
        title: "Access granted",
        description: `${integrationLabel} is now available to ${ids.length} brand${ids.length === 1 ? "" : "s"}.`,
      });
      onOpenChange(false);
      router.refresh();
      return;
    }

    show({
      title: "Some grants failed",
      description: `Could not grant access to: ${failures.join(", ")}.`,
      variant: "error",
    });
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Grant access to brands</DialogTitle>
          <DialogDescription>
            Pick which brands can use <span className="font-medium">{integrationLabel}</span>. Only
            brands you own or administer are listed.
          </DialogDescription>
        </DialogHeader>

        {eligibleBrands.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            You do not own or administer any brand yet. Create one in settings before sharing
            integrations.
          </p>
        ) : (
          <div className="flex flex-col gap-2 py-2 max-h-72 overflow-y-auto">
            {eligibleBrands.map((brand) => {
              const isAlreadyGranted = alreadyGrantedBrandIds?.has(brand.id) ?? false;
              const isChecked = isAlreadyGranted || selected.has(brand.id);
              return (
                <label
                  key={brand.id}
                  className={`flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 ${
                    isAlreadyGranted ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-accent/40"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={isAlreadyGranted || isSubmitting}
                    onCheckedChange={() => toggle(brand.id)}
                  />
                  <span className="flex-1 text-sm">{brand.name}</span>
                  {isAlreadyGranted ? (
                    <span className="text-xs text-muted-foreground">Already granted</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selected.size === 0 || eligibleBrands.length === 0}
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
