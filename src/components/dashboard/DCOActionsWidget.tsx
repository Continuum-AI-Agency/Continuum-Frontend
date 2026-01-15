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
} from "@radix-ui/react-icons";
import { 
  Accordion, 
} from "@/components/ui/Accordion";
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

function JsonDisplay({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  if (!data || Object.keys(data).length === 0) {
    return <Text size="1" color="gray">No {label.toLowerCase()}</Text>;
  }

  return (
    <Box>
      <Text size="1" color="gray" weight="medium">{label}</Text>
      <div 
        className="p-2 mt-1 overflow-auto max-h-[200px] bg-[var(--muted)] rounded-[var(--radius-2)] text-[var(--font-size-1)]"
      >
        <code>{JSON.stringify(data, null, 2)}</code>
      </div>
    </Box>
  );
}

function ActionItemContent({ log }: { log: ActionLog }) {
    return (
        <Flex direction="column" gap="3" pt="2">
          {log.decisionNote && (
            <Box>
              <Text size="1" color="gray" weight="medium">Decision Note</Text>
              <Text size="2">{log.decisionNote}</Text>
            </Box>
          )}
          
          <Flex direction="column" gap="3">
            <JsonDisplay data={log.paramsChanged} label="Parameters Changed" />
            <JsonDisplay data={log.actionPayload} label="Action Payload" />
            <JsonDisplay data={log.result} label="Result" />
          </Flex>
          
          {log.error && (
            <Box p="2" style={{ backgroundColor: "var(--red-2)", borderRadius: "var(--radius-2)" }}>
              <Text size="1" color="red" weight="medium">Error</Text>
              <Text size="2" color="red">{log.error}</Text>
            </Box>
          )}
        </Flex>
    )
}

function ActionItemHeader({ log }: { log: ActionLog }) {
    return (
        <Flex align="center" justify="between" gap="4" className="w-full pr-4">
          <Flex align="center" gap="3">
            <ShadcnBadge variant={getStatusVariant(log.status)}>
              {log.status}
            </ShadcnBadge>
            <Box>
              <Text weight="medium">{log.actionType.replace(/_/g, " ")}</Text>
              <Text color="gray" size="1">
                {log.scopeType}: {log.scopeId ? `${log.scopeId.slice(0, 8)}...` : "null"}
              </Text>
            </Box>
          </Flex>
          <Flex align="center" gap="3">
            <ShadcnBadge variant={getActionTypeColor(log.actionType)}>
              {log.scopeType.toUpperCase()}
            </ShadcnBadge>
            <Text color="gray" size="2">
              {formatTimestamp(log.occurredAt)}
            </Text>
          </Flex>
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

  const handleFilterChange = (key: string, value: string | undefined) => {
    setFilterState(prev => ({ ...prev, [key]: value }));
    setFilters({ [key]: value });
  };

  const handleSortChange = React.useCallback((newSortBy: "occurred_at" | "campaign_id") => {
    setSort({ sortBy: newSortBy, sortOrder: "desc" });
  }, [setSort]);

  const accordionItems = logs.map(log => ({
      value: log.id,
      header: <ActionItemHeader log={log} />,
      content: <ActionItemContent log={log} />
  }));

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
            <Box className="md:hidden">
                <Accordion items={accordionItems} type="single" collapsible />
            </Box>

            <Box className="hidden md:block" style={{ maxHeight: "400px", overflow: "auto" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Occurred</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
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
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="1">
                              <MagnifyingGlassIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-md">
                            <Flex direction="column" gap="2">
                              <JsonDisplay data={log.paramsChanged} label="Parameters" />
                              <JsonDisplay data={log.result} label="Result" />
                            </Flex>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
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
