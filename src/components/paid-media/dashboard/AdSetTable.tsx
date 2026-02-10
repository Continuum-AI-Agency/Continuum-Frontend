"use client";

import * as React from "react";
import { ArrowUpIcon, ArrowDownIcon } from "@radix-ui/react-icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

type AdSetTableProps = {
  adSets: AdSet[];
  campaignId: string;
  isLoading?: boolean;
  onAdSetSelect?: (adSetId: string) => void;
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

export function AdSetTable({ adSets, campaignId, isLoading, onAdSetSelect }: AdSetTableProps) {
  const [sortField, setSortField] = React.useState<SortField>("spend");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
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
  }, [adSets, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ArrowUpIcon className="ml-1 h-3 w-3 inline" />
    ) : (
      <ArrowDownIcon className="ml-1 h-3 w-3 inline" />
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
    return (
      <div className="text-center py-8 text-muted-foreground">
        No ad sets found for this campaign.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button
                onClick={() => handleSort("name")}
                className="font-medium hover:underline focus:outline-none"
              >
                Ad Set Name
                <SortIcon field="name" />
              </button>
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("spend")}
                className="font-medium hover:underline focus:outline-none w-full text-right"
              >
                Spend
                <SortIcon field="spend" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("roas")}
                className="font-medium hover:underline focus:outline-none w-full text-right"
              >
                ROAS
                <SortIcon field="roas" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("ctr")}
                className="font-medium hover:underline focus:outline-none w-full text-right"
              >
                CTR
                <SortIcon field="ctr" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("impressions")}
                className="font-medium hover:underline focus:outline-none w-full text-right"
              >
                Impressions
                <SortIcon field="impressions" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                onClick={() => handleSort("clicks")}
                className="font-medium hover:underline focus:outline-none w-full text-right"
              >
                Clicks
                <SortIcon field="clicks" />
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAdSets.map((adSet) => (
            <TableRow
              key={adSet.id}
              onClick={() => onAdSetSelect?.(adSet.id)}
              className={cn(
                onAdSetSelect && "cursor-pointer hover:bg-muted/50"
              )}
            >
              <TableCell className="font-medium">{adSet.name}</TableCell>
              <TableCell>
                <Badge variant={getStatusColor(adSet.status)}>
                  {adSet.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {adSet.metrics ? formatCurrency(adSet.metrics.spend) : "-"}
              </TableCell>
              <TableCell className="text-right">
                {adSet.metrics ? adSet.metrics.roas.toFixed(2) : "-"}
              </TableCell>
              <TableCell className="text-right">
                {adSet.metrics ? formatPercent(adSet.metrics.ctr) : "-"}
              </TableCell>
              <TableCell className="text-right">
                {adSet.metrics ? formatNumber(adSet.metrics.impressions) : "-"}
              </TableCell>
              <TableCell className="text-right">
                {adSet.metrics ? formatNumber(adSet.metrics.clicks) : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
