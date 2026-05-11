"use client";

import { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { useSwitchBrand } from "@/hooks/useSwitchBrand";
import type { BrandPermission, BrandSummary } from "@/components/DashboardLayoutShell";

type UserBrandsPanelProps = {
  permissions: BrandPermission[];
};

export function UserBrandsPanel({ permissions }: UserBrandsPanelProps) {
  const { activeBrandId, brandSummaries, isSwitching, switchingToBrandId } =
    useActiveBrandContext();
  const switchBrand = useSwitchBrand();
  const [pendingBrandId, setPendingBrandId] = useState<string | null>(null);

  const roleByBrandId = new Map(
    permissions.map((p) => [p.brand_profile_id, p.role])
  );

  const handleSwitch = async (brandId: string) => {
    setPendingBrandId(brandId);
    try {
      await switchBrand(brandId);
    } finally {
      setPendingBrandId(null);
    }
  };

  if (brandSummaries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center text-sm text-muted-foreground">
        You haven&apos;t joined any brands yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/20">
      {brandSummaries.map((brand) => (
        <BrandRow
          key={brand.id}
          brand={brand}
          role={roleByBrandId.get(brand.id) ?? null}
          isActive={brand.id === activeBrandId}
          isPending={brand.isPending ?? false}
          isSwitching={
            isSwitching && switchingToBrandId === brand.id || pendingBrandId === brand.id
          }
          disabled={isSwitching}
          onSwitch={() => handleSwitch(brand.id)}
        />
      ))}
    </ul>
  );
}

type BrandRowProps = {
  brand: BrandSummary;
  role: string | null;
  isActive: boolean;
  isPending: boolean;
  isSwitching: boolean;
  disabled: boolean;
  onSwitch: () => void;
};

function BrandRow({
  brand,
  role,
  isActive,
  isPending,
  isSwitching,
  disabled,
  onSwitch,
}: BrandRowProps) {
  const initial = brand.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-sm font-semibold uppercase text-muted-foreground">
        {brand.logoUrl ? (
          <Image
            src={brand.logoUrl}
            alt=""
            width={36}
            height={36}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          initial
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{brand.name}</p>
          {isActive ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Check className="h-3 w-3" />
              Active
            </Badge>
          ) : null}
          {isPending ? (
            <Badge variant="outline" className="text-[10px]">Invite pending</Badge>
          ) : null}
        </div>
        {role ? (
          <p className="text-xs capitalize text-muted-foreground">{role}</p>
        ) : null}
      </div>
      {isActive ? (
        <span className="text-xs text-muted-foreground">Current</span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onSwitch}
          disabled={disabled || isPending}
        >
          {isSwitching ? "Switching…" : "Switch"}
        </Button>
      )}
    </li>
  );
}
