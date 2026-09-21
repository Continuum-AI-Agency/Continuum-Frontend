'use client';

import { Loader2, RefreshCw, Search, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ACCESS_PRODUCTS, formatDate } from '@/components/admin/adminUserListUtils';
import type { AdminBrandOption } from '@/components/admin/adminUserTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fuzzyMatches } from '@/lib/search/fuzzy';

type BrandsTabProps = {
  brands: AdminBrandOption[];
  isLoading: boolean;
  onRefresh: () => void;
  onViewWorkflows: (brandId: string) => void;
};

// The brand roster. Until now brands existed in the console only as combobox
// options, so there was no way to see how many members or saved canvases a brand
// had, or to find one by its owner's email.
//
// The whole list is already in memory for the transfer pickers (315 rows), so
// this filters in place instead of paginating -- searching is instant and costs
// no round trip. Revisit if the roster ever outgrows a single response.
const PRODUCT_LABEL = new Map(ACCESS_PRODUCTS.map(({ product, label }) => [product, label]));

export function BrandsTab({ brands, isLoading, onRefresh, onViewWorkflows }: BrandsTabProps) {
  const [query, setQuery] = useState('');
  // billing-cutover: list_brands sends `access` once billing is live, the tier until then.
  const billingLive = brands.some((brand) => brand.access);

  const visibleBrands = useMemo(
    () =>
      brands.filter((brand) => fuzzyMatches([brand.brand_name, brand.ownerEmail, brand.id], query)),
    [brands, query],
  );

  return (
    <div className="space-y-3" data-testid="admin-brands-panel">
      <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-primary">Brands</h2>
          <p className="text-xs text-muted-foreground">
            {query
              ? `${visibleBrands.length} of ${brands.length} brands`
              : `${brands.length} brands`}
            {' · '}
            Duplicate names are common, so the owner email is what tells two apart.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search brands, owners, or ids"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 pl-9"
              aria-label="Search brands"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-subtle bg-surface">
        <div className="max-h-[620px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-surface">
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className={billingLive ? 'w-56' : 'w-20'}>
                  {billingLive ? 'Access' : 'Tier'}
                </TableHead>
                <TableHead className="w-24">Members</TableHead>
                <TableHead className="w-24">Canvases</TableHead>
                <TableHead className="w-36">Created</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleBrands.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {brands.length === 0 ? 'No brands loaded.' : `No brands match "${query}".`}
                  </TableCell>
                </TableRow>
              ) : (
                visibleBrands.map((brand) => (
                  <TableRow key={brand.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-primary">
                            {brand.brand_name}
                          </span>
                          {brand.active ? null : <Badge variant="outline">Inactive</Badge>}
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {brand.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {brand.ownerEmail ?? 'No owner'}
                    </TableCell>
                    <TableCell>
                      {brand.access ? (
                        <div className="flex flex-wrap gap-1">
                          {brand.access.billingModel === 'contract' ? (
                            <Badge variant="secondary">Contract</Badge>
                          ) : null}
                          {brand.access.products.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            brand.access.products.map((grant) => (
                              <Badge key={grant.product} variant="outline">
                                {PRODUCT_LABEL.get(grant.product) ?? grant.product}
                                {grant.source === 'stripe' ? ' · Stripe' : ''}
                              </Badge>
                            ))
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary">T{brand.tier ?? 0}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-primary">
                      {brand.memberCount ?? 0}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-primary">
                      {brand.workflowCount ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(brand.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewWorkflows(brand.id)}
                        disabled={(brand.workflowCount ?? 0) === 0}
                      >
                        <Workflow className="size-4" />
                        Canvases
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
