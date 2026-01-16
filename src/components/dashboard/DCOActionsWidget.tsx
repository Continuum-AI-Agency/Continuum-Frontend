"use client";

import * as React from "react";
import { 
  Badge, 
  Box, 
  Flex, 
  Heading, 
  IconButton, 
  Separator, 
  Text,
  Button,
} from "@radix-ui/themes";
import {
  ActivityLogIcon,
  OpenInNewWindowIcon,
  PinTopIcon,
  ReloadIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useDCOActionLogs } from "@/hooks/useDCOActionLogs";
import type { ActionLog, ActionType, ActionStatus } from "@/lib/types/dco";

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${Math.floor(diffHours)}h ago`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

const getStatusVariant = (status: ActionStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "SUCCESS": return "default";
    case "FAILED": return "destructive";
    case "PENDING": return "secondary";
    default: return "outline";
  }
};

const getActionTypeColor = (actionType: ActionType): "default" | "secondary" | "destructive" | "outline" => {
  if (actionType.includes("PAUSE") || actionType.includes("ARCHIVE")) return "destructive";
  if (actionType.includes("CREATE") || actionType.includes("SCALE")) return "default";
  return "secondary";
};

const CURRENCY_KEYS = ["spend", "budget", "cost", "price", "bid", "cpc", "cpm", "cpa", "revenue"];

function formatCurrency(value: number | string): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatDetailValue(key: string, value: unknown): string {
  const lowerKey = key.toLowerCase();
  const isCurrencyKey = CURRENCY_KEYS.some((term) => lowerKey.includes(term));

  if (typeof value === "number") {
    if (isCurrencyKey) {
      return formatCurrency(value);
    }
    return value.toString();
  }

  if (typeof value === "string") {
    // Case 1: The value itself is a currency string with an operator (e.g. "> 2000")
    // and the key is a currency key.
    if (isCurrencyKey) {
      // Matches ">= 2000", "> 2000", "2000", etc.
      const match = value.match(/^([<>=!]+\s*)?(\d+(?:\.\d+)?)$/);
      if (match) {
        const prefix = match[1] || "";
        const numberPart = match[2];
        return `${prefix}${formatCurrency(numberPart)}`;
      }
    }

    // Case 2: It's a text block (like "reason") that mentions currency keywords.
    // "Account ROAS below 1.0 with spend > 2000"
    const currencyContextRegex = /\b(spend|budget|cost|price|bid|revenue|cpc|cpm|cpa)\s*([<>=]+|is|:|under|over|above|below)?\s*(\d+(?:\.\d{1,2})?)\b/gi;
    
    return value.replace(currencyContextRegex, (match, keyword, operator, number) => {
      // Reconstruct the string with the formatted currency
      const prefix = operator ? `${operator} ` : "";
      // Clean up whitespace in reconstruction
      return `${keyword} ${prefix.trim()} ${formatCurrency(number)}`.trim().replace(/\s+/g, " ");
    });
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function DetailSection({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <Box>
      <Text size="1" color="gray" weight="medium" className="uppercase tracking-wider mb-2 block">
        {label}
      </Text>
      <div className="rounded-md border bg-[var(--gray-2)] p-3 text-sm">
        <div className="grid gap-2">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[140px_1fr] gap-4">
              <span className="font-medium text-gray-500 capitalize truncate" title={key}>
                {key.replace(/_/g, " ")}
              </span>
              <span className="text-gray-900 break-words font-mono text-xs">
                {formatDetailValue(key, value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Box>
  );
}

function ActionItemContent({ log }: { log: ActionLog }) {
    return (
        <Flex direction="column" gap="4" pt="2">
          {log.decisionNote && (
            <Box>
              <Text size="1" color="gray" weight="medium" className="uppercase tracking-wider mb-2 block">
                Decision Note
              </Text>
              <div className="rounded-md border bg-blue-50/50 p-3 text-sm text-gray-900">
                {log.decisionNote}
              </div>
            </Box>
          )}
          
          <div className="grid gap-4 md:grid-cols-2">
            <DetailSection data={log.paramsChanged} label="Parameters Changed" />
            <DetailSection data={log.actionPayload} label="Action Payload" />
          </div>
          
          <DetailSection data={log.result} label="Result" />
          
          {log.error && (
            <Box>
              <Text size="1" color="red" weight="medium" className="uppercase tracking-wider mb-2 block">
                Error
              </Text>
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {log.error}
              </div>
            </Box>
          )}
        </Flex>
    )
}

function LoadingSkeleton() {
  return (
    <Flex direction="column" gap="3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Box key={i}>
          <Flex align="center" justify="between" gap="4">
            <Flex align="center" gap="3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Box>
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-48" />
              </Box>
            </Flex>
            <Skeleton className="h-6 w-20" />
          </Flex>
          {i < 2 && <Separator my="3" />}
        </Box>
      ))}
    </Flex>
  );
}

function AdAccountSelector({ 
  accounts, 
  selectedId, 
  onChange,
  isLoading 
}: {
  accounts: { id: string; name: string }[];
  selectedId?: string;
  onChange: (value: string | undefined) => void;
  isLoading: boolean;
}) {
  return (
    <Flex align="center" gap="2">
      <Text size="1" color="gray">Ad Account:</Text>
      <Select 
        value={selectedId ?? ""} 
        onValueChange={(value) => onChange(value === "all" ? undefined : value)}
      >
        <SelectTrigger 
          className="w-[200px]" 
          disabled={isLoading}
        >
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name || account.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {isLoading && (
        <Skeleton className="h-6 w-6 rounded animate-pulse" />
      )}
    </Flex>
  );
}

function CampaignSelector({ 
  campaigns, 
  selectedId, 
  onChange,
  isLoading 
}: {
  campaigns: { id: string; name: string }[];
  selectedId?: string;
  onChange: (value: string | undefined) => void;
  isLoading: boolean;
}) {
  return (
    <Flex align="center" gap="2">
      <Text size="1" color="gray">Campaign:</Text>
      <Select 
        value={selectedId ?? ""} 
        onValueChange={(value) => onChange(value === "all" ? undefined : value)}
      >
        <SelectTrigger 
          className="w-[200px]" 
          disabled={isLoading}
        >
          <SelectValue placeholder="All campaigns" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All campaigns</SelectItem>
          {campaigns.map((campaign) => (
            <SelectItem key={campaign.id} value={campaign.id}>
              {campaign.name || campaign.id.slice(0, 12) + "..."}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {isLoading && (
        <Skeleton className="h-6 w-6 rounded animate-pulse" />
      )}
    </Flex>
  );
}

function SortSelector({ 
  value, 
  onChange 
}: {
  value: "occurred_at" | "campaign_id";
  onChange: (value: "occurred_at" | "campaign_id") => void;
}) {
  return (
    <Flex align="center" gap="2">
      <Text size="1" color="gray">Sort by:</Text>
      <Select 
        value={value} 
        onValueChange={(val) => onChange(val as "occurred_at" | "campaign_id")}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="occurred_at">Date (default)</SelectItem>
          <SelectItem value="campaign_id">Campaign ID</SelectItem>
        </SelectContent>
      </Select>
    </Flex>
  );
}

interface FilterControlsProps {
  filters: {
    status?: string;
    actionType?: string;
    scopeType?: string;
    campaignId?: string;
    metaAccountId?: string;
  };
  campaigns: { id: string; name: string }[];
  adAccounts: { id: string; name: string }[];
  isLoadingCampaigns: boolean;
  isLoadingAdAccounts: boolean;
  onFilterChange: (key: string, value: string | undefined) => void;
}

function FilterControls({ 
  filters, 
  campaigns,
  adAccounts,
  isLoadingCampaigns,
  isLoadingAdAccounts,
  onFilterChange 
}: FilterControlsProps) {
  return (
    <Flex gap="2" wrap="wrap" align="center">
      <AdAccountSelector 
        accounts={adAccounts}
        selectedId={filters.metaAccountId}
        onChange={(value) => onFilterChange("metaAccountId", value)}
        isLoading={isLoadingAdAccounts}
      />

      <CampaignSelector 
        campaigns={campaigns}
        selectedId={filters.campaignId}
        onChange={(value) => onFilterChange("campaignId", value)}
        isLoading={isLoadingCampaigns}
      />

      <Select 
        value={filters.status ?? ""} 
        onValueChange={(value) => onFilterChange("status", value === "all" ? undefined : value)}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="SUCCESS">Success</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
        </SelectContent>
      </Select>

      <Select 
        value={filters.actionType ?? ""} 
        onValueChange={(value) => onFilterChange("actionType", value === "all" ? undefined : value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          <SelectItem value="PAUSE_ENTITY">Pause Entity</SelectItem>
          <SelectItem value="SWITCH_CREATIVE">Switch Creative</SelectItem>
          <SelectItem value="ADJUST_BUDGET">Adjust Budget</SelectItem>
          <SelectItem value="SCALE_BUDGET">Scale Budget</SelectItem>
          <SelectItem value="CREATE_VARIANT">Create Variant</SelectItem>
          <SelectItem value="ARCHIVE_ENTITY">Archive Entity</SelectItem>
        </SelectContent>
      </Select>

      <Select 
        value={filters.scopeType ?? ""} 
        onValueChange={(value) => onFilterChange("scopeType", value === "all" ? undefined : value)}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Scope" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Scopes</SelectItem>
          <SelectItem value="campaign">Campaign</SelectItem>
          <SelectItem value="adset">Ad Set</SelectItem>
          <SelectItem value="ad">Ad</SelectItem>
        </SelectContent>
      </Select>
    </Flex>
  );
}

interface DCOActionsWidgetProps {
  brandId: string;
  metaAccountId?: string;
  className?: string;
}

export function DCOActionsWidget({ 
  brandId, 
  metaAccountId,
  className 
}: DCOActionsWidgetProps) {
  const {
    logs,
    isLoading,
    error,
    pagination,
    filters,
    sort,
    campaigns,
    adAccounts,
    isLoadingCampaigns,
    isLoadingAdAccounts,
    setFilters,
    setSort,
    goToPage,
    refresh,
  } = useDCOActionLogs({
    brandId,
    metaAccountId,
  });

  const [filterState, setFilterState] = React.useState({
    status: filters.status,
    actionType: filters.actionType,
    scopeType: filters.scopeType,
    campaignId: filters.campaignId,
    metaAccountId: filters.metaAccountId,
  });

  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleFilterChange = (key: string, value: string | undefined) => {
    setFilterState(prev => ({ ...prev, [key]: value }));
    setFilters({ [key]: value });
  };

  const handleSortChange = React.useCallback((newSortBy: "occurred_at" | "campaign_id") => {
    setSort({ sortBy: newSortBy, sortOrder: "desc" });
  }, [setSort]);

  return (
    <TooltipProvider>
      <Box className={className}>
        <Flex align="center" justify="between" gap="3" wrap="wrap" mb="3">
          <Flex align="center" gap="2">
            <Badge color="gray" variant="soft" radius="full">
              <ActivityLogIcon />
            </Badge>
            <Box>
              <Heading size="4">DCO Actions</Heading>
              <Text color="gray" size="2">
                Automated actions from the last 7 days
              </Text>
            </Box>
          </Flex>
          <Flex gap="2">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton variant="soft" color="gray" onClick={refresh} disabled={isLoading}>
                  <ReloadIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <IconButton variant="soft" color="gray" aria-label="Open full activity log">
              <OpenInNewWindowIcon />
            </IconButton>
            <IconButton variant="soft" color="gray" aria-label="Pin activity log">
              <PinTopIcon />
            </IconButton>
          </Flex>
        </Flex>

        <Separator mb="3" />

        <Flex justify="between" align="center" mb="3" wrap="wrap" gap="2">
          <FilterControls 
            filters={filterState}
            campaigns={campaigns}
            adAccounts={adAccounts}
            isLoadingCampaigns={isLoadingCampaigns}
            isLoadingAdAccounts={isLoadingAdAccounts}
            onFilterChange={handleFilterChange}
          />
          
          <Flex align="center" gap="3">
            <SortSelector 
              value={sort.sortBy}
              onChange={handleSortChange}
            />
            <Text color="gray" size="2">
              {pagination.totalCount} actions
            </Text>
          </Flex>
        </Flex>

        {error && (
          <Box p="3" style={{ backgroundColor: "var(--red-2)", borderRadius: "var(--radius-2)" }}>
            <Text size="2" color="red">{error}</Text>
            <Button variant="soft" color="red" size="1" mt="2" onClick={refresh}>
              Retry
            </Button>
          </Box>
        )}

        {isLoading && <LoadingSkeleton />}

        {!isLoading && !error && logs.length === 0 && (
          <Box py="6" className="text-center">
            <Text color="gray" size="2">
              No DCO activity in the selected time period.
            </Text>
            <Text color="gray" size="1" className="block mt-1">
              Automations will appear here as they run.
            </Text>
          </Box>
        )}

        {!isLoading && !error && logs.length > 0 && (
          <>
            <Box className="flex-1 min-h-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Occurred</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const isExpanded = expandedRows.has(log.id);
                    return (
                      <React.Fragment key={log.id}>
                        <TableRow 
                          className="group cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleRow(log.id)}
                        >
                          <TableCell>
                            <Button variant="ghost" size="1" className="p-0 h-6 w-6">
                              <ChevronDownIcon 
                                className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                              />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <ShadcnBadge variant={getStatusVariant(log.status)}>
                              {log.status}
                            </ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <Text weight="medium">
                              {log.actionType.replace(/_/g, " ")}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <ShadcnBadge variant="outline">
                              {log.scopeType.toUpperCase()}
                            </ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <Text size="2" color="gray">
                              {formatTimestamp(log.occurredAt)}
                            </Text>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-[var(--gray-2)] hover:bg-[var(--gray-2)]">
                            <TableCell colSpan={5} className="p-0 border-b">
                              <Box p="4">
                                <ActionItemContent log={log} />
                              </Box>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            {pagination.totalPages > 1 && (
              <Flex justify="center" mt="4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => goToPage(pagination.page - 1)}
                        disabled={!pagination.hasPrevPage}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: Math.min(5, pagination.totalPages) }).map((_, i) => {
                      let pageNum: number;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else {
                        if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }
                      }
                      
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => goToPage(pageNum)}
                            isActive={pagination.page === pageNum}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => goToPage(pagination.page + 1)}
                        disabled={!pagination.hasNextPage}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </Flex>
            )}
          </>
        )}
      </Box>
    </TooltipProvider>
  );
}
