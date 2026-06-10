"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandAvatar } from "@/components/brand/BrandAvatar";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { useInfiniteUserBrands, type UserBrandListItem } from "@/hooks/useInfiniteUserBrands";
import { useSwitchBrand } from "@/hooks/useSwitchBrand";
import type { BrandPermission, BrandSummary } from "@/components/DashboardLayoutShell";

type UserBrandsPanelProps = {
  permissions: BrandPermission[];
};

export function UserBrandsPanel({ permissions }: UserBrandsPanelProps) {
  const { activeBrandId, brandSummaries, isSwitching, switchingToBrandId, user } =
    useActiveBrandContext();
  const switchBrand = useSwitchBrand();
  const [pendingBrandId, setPendingBrandId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const roleByBrandId = useMemo(
    () => new Map(permissions.map((p) => [p.brand_profile_id, p.role])),
    [permissions]
  );
  const fallbackBrands = useMemo(
    () => brandSummaries.map((brand) => ({ ...brand, role: roleByBrandId.get(brand.id) ?? null })),
    [brandSummaries, roleByBrandId]
  );
  const {
    brands: loadedBrands,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteUserBrands({ userId: user?.id, userEmail: user?.email });
  const brands = loadedBrands.length > 0 ? loadedBrands : fallbackBrands;
  const visibleBrands = useMemo(
    () => brands.filter((brand) => matchesBrandSearch(brand, searchQuery)),
    [brands, searchQuery]
  );

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasNextPage || isFetchingNextPage || searchQuery.trim()) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "96px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim() || !hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, searchQuery]);

  const handleSwitch = async (brandId: string) => {
    setPendingBrandId(brandId);
    try {
      await switchBrand(brandId);
    } finally {
      setPendingBrandId(null);
    }
  };

  if (!isLoading && brands.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center text-sm text-muted-foreground">
        You haven&apos;t joined any brands yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search brands"
          aria-label="Search your brands"
          className="pl-9"
        />
      </div>
      <div
        ref={scrollRootRef}
        className="max-h-[min(520px,calc(100vh-21rem))] overflow-y-auto rounded-lg border border-border/60 bg-card/20"
      >
        {isLoading && loadedBrands.length === 0 ? (
          <div className="space-y-3 px-4 py-4" aria-label="Loading brands">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted/70" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-muted/70" />
                  <div className="h-2.5 w-20 rounded bg-muted/50" />
                </div>
                <div className="h-8 w-16 rounded-md bg-muted/60" />
              </div>
            ))}
          </div>
        ) : visibleBrands.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {visibleBrands.map((brand) => (
              <BrandRow
                key={brand.id}
                brand={brand}
                role={brand.role}
                isActive={brand.id === activeBrandId}
                isPending={brand.isPending ?? false}
                isSwitching={
                  (isSwitching && switchingToBrandId === brand.id) || pendingBrandId === brand.id
                }
                disabled={isSwitching}
                onSwitch={() => handleSwitch(brand.id)}
              />
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No brands match your search.
          </div>
        )}
        <div ref={sentinelRef} className="h-px" aria-hidden />
        {isFetchingNextPage ? (
          <div className="flex items-center justify-center gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading more brands
          </div>
        ) : null}
      </div>
      {isError ? (
        <p className="text-xs text-destructive">
          Brand pagination failed. Showing the brands already loaded for this session.
        </p>
      ) : null}
    </div>
  );
}

type BrandRowProps = {
  brand: BrandSummary | UserBrandListItem;
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
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <BrandAvatar name={brand.name} logoUrl={brand.logoUrl ?? null} size="lg" />
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
          className="gap-1.5"
        >
          {isSwitching ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Switching…
            </>
          ) : (
            "Switch"
          )}
        </Button>
      )}
    </li>
  );
}

export function matchesBrandSearch(brand: UserBrandListItem, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const searchable = [
    brand.name,
    brand.role,
    brand.id,
  ].filter((value): value is string => Boolean(value));

  return searchable.some((value) => fuzzyIncludes(normalizeSearchText(value), normalizedQuery));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fuzzyIncludes(value: string, query: string): boolean {
  if (value.includes(query)) {
    return true;
  }

  let queryIndex = 0;
  for (const char of value) {
    if (char === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }

  return false;
}
