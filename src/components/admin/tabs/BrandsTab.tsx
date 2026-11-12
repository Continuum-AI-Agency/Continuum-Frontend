'use client';

import { Loader2, RefreshCw, Search, Workflow } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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
  const uiText = useTranslations('admin');
  const uiLocale = useLocale();
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
          <h2 className="text-base font-semibold text-foreground">{uiText('brands_ec26be2')}</h2>
          <p className="text-xs text-muted-foreground">
            {uiText('m_ca63c28ccd', {
              filtered: query ? 'yes' : 'no',
              shown: visibleBrands.length,
              total: brands.length,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={uiText('search_brands_owners_or_ids_829f168')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 pl-9"
              aria-label={uiText('search_brands_50539c7')}
            />
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            {uiText.rich('sentence_33ac68602e96', {
              v0: () =>
                isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                ),
            })}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-subtle bg-surface">
        <div className="max-h-[620px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-surface">
              <TableRow>
                <TableHead>{uiText('brand_090ed43')}</TableHead>
                <TableHead>{uiText('owner_4b1b8aa')}</TableHead>
                <TableHead className={billingLive ? 'w-56' : 'w-20'}>
                  {billingLive ? uiText('access_ec5ba0a') : uiText('tier_cb9e866')}
                </TableHead>
                <TableHead className="w-24">{uiText('members_1044a4c')}</TableHead>
                <TableHead className="w-24">{uiText('canvases_811c4ef')}</TableHead>
                <TableHead className="w-36">{uiText('created_d70b9e2')}</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleBrands.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {brands.length === 0
                      ? uiText('no_brands_loaded_838eec9')
                      : uiText('m_bd1be91937', { v0: String(query) })}
                  </TableCell>
                </TableRow>
              ) : (
                visibleBrands.map((brand) => (
                  <TableRow key={brand.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {brand.brand_name}
                          </span>
                          {brand.active ? null : (
                            <Badge variant="outline">{uiText('inactive_ac7c949')}</Badge>
                          )}
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {brand.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {brand.ownerEmail ?? uiText('no_owner_4339bb4')}
                    </TableCell>
                    <TableCell>
                      {brand.access ? (
                        <div className="flex flex-wrap gap-1">
                          {brand.access.billingModel === 'contract' ? (
                            <Badge variant="secondary">{uiText('contract_a6f5b0e')}</Badge>
                          ) : null}
                          {brand.access.products.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {uiText('none_dc937b5')}
                            </span>
                          ) : (
                            brand.access.products.map((grant) => (
                              <Badge key={grant.product} variant="outline">
                                {PRODUCT_LABEL.get(grant.product) ?? grant.product}
                                {grant.source === 'stripe' ? uiText('m_df3c870cc6') : ''}
                              </Badge>
                            ))
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary">
                          {uiText.rich('sentence_f5d07d8dcc49', {
                            v0: () => brand.tier ?? 0,
                          })}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-foreground">
                      {brand.memberCount ?? 0}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-foreground">
                      {brand.workflowCount ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(brand.created_at, uiLocale, uiText)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewWorkflows(brand.id)}
                        disabled={(brand.workflowCount ?? 0) === 0}
                      >
                        <Workflow className="size-4" />
                        {uiText('canvases_811c4ef')}
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
