"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ReloadIcon } from "@radix-ui/react-icons";

import { CardOverlayDemo } from "@/components/shadcn-studio/card/card-07";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type AdSet = {
  id: string;
  name: string;
  status: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
  bidStrategy?: string;
  metrics?: {
    spend: number;
    roas: number;
    ctr: number;
    cpc: number;
    impressions: number;
    clicks: number;
  };
};

export type MetaAd = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  previewShareableLink?: string | null;
  creative?: {
    id: string;
    name?: string | null;
    title?: string | null;
    body?: string | null;
    thumbnailUrl?: string | null;
    imageUrl?: string | null;
    callToActionType?: string | null;
  } | null;
};

export type AdSetAdsLoadState = {
  status: "idle" | "loading" | "success" | "error";
  ads: MetaAd[];
  errorMessage?: string;
};

type AdSetTableProps = {
  adSets: AdSet[];
  isLoading?: boolean;
  adsByAdSet?: Record<string, AdSetAdsLoadState>;
  onAdSetToggle?: (adSetId: string, expanded: boolean) => void;
};

type SortField = "name" | "spend" | "roas" | "ctr" | "impressions" | "clicks";
type SortDirection = "asc" | "desc";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function getStatusColor(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "default";
    case "PAUSED":
      return "secondary";
    case "ARCHIVED":
    case "DELETED":
      return "destructive";
    default:
      return "outline";
  }
}

export function AdSetTable({ adSets, isLoading, adsByAdSet, onAdSetToggle }: AdSetTableProps) {
  const [sortField, setSortField] = React.useState<SortField>("spend");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [expandedAdSetId, setExpandedAdSetId] = React.useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortField(field);
    setSortDirection("desc");
  };

  const handleAdSetRowClick = (adSetId: string) => {
    const isExpanding = expandedAdSetId !== adSetId;
    setExpandedAdSetId(isExpanding ? adSetId : null);
    onAdSetToggle?.(adSetId, isExpanding);
  };

  const sortedAdSets = React.useMemo(() => {
    const sorted = [...adSets];

    sorted.sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;

      if (sortField === "name") {
        aValue = a.name || "";
        bValue = b.name || "";
      } else {
        aValue = a.metrics?.[sortField] ?? 0;
        bValue = b.metrics?.[sortField] ?? 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      return sortDirection === "asc" ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);
    });

    return sorted;
  }, [adSets, sortDirection, sortField]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;

    return sortDirection === "asc" ? (
      <ArrowUpIcon className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDownIcon className="ml-1 inline h-3 w-3" />
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (adSets.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">No ad sets found for this campaign.</div>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>
              <button onClick={() => handleSort("name")} className="font-medium hover:underline focus:outline-none">
                Ad Set Name
                <SortIcon field="name" />
              </button>
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("spend")}
                className="w-full text-right font-medium hover:underline focus:outline-none"
              >
                Spend
                <SortIcon field="spend" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("roas")}
                className="w-full text-right font-medium hover:underline focus:outline-none"
              >
                ROAS
                <SortIcon field="roas" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("ctr")}
                className="w-full text-right font-medium hover:underline focus:outline-none"
              >
                CTR
                <SortIcon field="ctr" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("impressions")}
                className="w-full text-right font-medium hover:underline focus:outline-none"
              >
                Impressions
                <SortIcon field="impressions" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("clicks")}
                className="w-full text-right font-medium hover:underline focus:outline-none"
              >
                Clicks
                <SortIcon field="clicks" />
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAdSets.map((adSet) => {
            const isExpanded = expandedAdSetId === adSet.id;
            const adsState = adsByAdSet?.[adSet.id];

            return (
              <React.Fragment key={adSet.id}>
                <TableRow
                  onClick={() => handleAdSetRowClick(adSet.id)}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/50", isExpanded && "bg-muted/40")}
                  aria-expanded={isExpanded}
                >
                  <TableCell>
                    <ChevronDownIcon className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                  </TableCell>
                  <TableCell className="font-medium">{adSet.name}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(adSet.status)}>{adSet.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{adSet.metrics ? formatCurrency(adSet.metrics.spend) : "-"}</TableCell>
                  <TableCell className="text-right">{adSet.metrics ? adSet.metrics.roas.toFixed(2) : "-"}</TableCell>
                  <TableCell className="text-right">{adSet.metrics ? formatPercent(adSet.metrics.ctr) : "-"}</TableCell>
                  <TableCell className="text-right">
                    {adSet.metrics ? formatNumber(adSet.metrics.impressions) : "-"}
                  </TableCell>
                  <TableCell className="text-right">{adSet.metrics ? formatNumber(adSet.metrics.clicks) : "-"}</TableCell>
                </TableRow>

                {isExpanded ? (
                  <TableRow className="bg-muted/25 hover:bg-muted/25">
                    <TableCell colSpan={8} className="p-4">
                      {adsState?.status === "loading" ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ReloadIcon className="h-4 w-4 animate-spin" />
                          Loading ads and creatives...
                        </div>
                      ) : null}

                      {adsState?.status === "error" ? (
                        <div className="text-sm text-destructive">
                          {adsState.errorMessage || "Failed to load ads for this ad set."}
                        </div>
                      ) : null}

                      {adsState?.status === "success" && adsState.ads.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No ads returned for this ad set.</div>
                      ) : null}

                      {adsState?.status === "success" && adsState.ads.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          {adsState.ads.map((ad) => {
                            const imageUrl = ad.creative?.thumbnailUrl || ad.creative?.imageUrl || null;
                            const title = ad.creative?.title || ad.name || "Untitled ad";
                            const postCopy = ad.creative?.body || "No post copy available.";

                            return (
                              <div key={ad.id} className="space-y-2">
                                <CardOverlayDemo
                                  title={title}
                                  description={postCopy}
                                  imageUrl={imageUrl}
                                  status={ad.effectiveStatus}
                                  callToAction={ad.creative?.callToActionType}
                                  alt={ad.name}
                                />
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Ad ID: {ad.id}</span>
                                  {ad.previewShareableLink ? (
                                    <a
                                      href={ad.previewShareableLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline underline-offset-2"
                                    >
                                      Preview
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
