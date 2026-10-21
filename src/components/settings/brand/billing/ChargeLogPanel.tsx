'use client';

import type { BillingManagementModel } from '@continuum/billing-ui';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buildChargeLogRows, chargeLogToCsv, chargeLogToJson } from './buildChargeLog';
import { downloadTextFile, formatShortDate } from './billingFormat';

type ChargeLogPanelProps = {
  model: BillingManagementModel;
};

export function ChargeLogPanel({ model }: ChargeLogPanelProps) {
  const rows = buildChargeLogRows(model);

  const downloadCsv = () => {
    downloadTextFile(
      `continuum-billing-${model.brandId.slice(0, 8)}.csv`,
      chargeLogToCsv(model),
      'text/csv;charset=utf-8',
    );
  };

  const downloadJson = () => {
    downloadTextFile(
      `continuum-billing-${model.brandId.slice(0, 8)}.json`,
      chargeLogToJson(model),
      'application/json;charset=utf-8',
    );
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Charge log</CardTitle>
            <CardDescription>
              Every invoice line, subscription item, and credit meter snapshot in one scrollable feed.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={downloadCsv}>
              <Download className="size-3.5" aria-hidden />
              CSV
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={downloadJson}>
              <Download className="size-3.5" aria-hidden />
              JSON
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No charges to export yet.
          </p>
        ) : (
          <ScrollArea className="h-[min(22rem,45vh)] pr-3">
            <ul className="divide-y divide-border/70 rounded-lg border border-border/70">
              {rows.map((row, index) => (
                <li
                  key={`${row.kind}-${row.label}-${row.date}-${index}`}
                  className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{row.label}</p>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {row.kind.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatShortDate(row.date)} · {row.detail}
                    </p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="font-mono text-sm font-medium tabular-nums">{row.amountLabel}</p>
                    <p className="text-xs capitalize text-muted-foreground">{row.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
