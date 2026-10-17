'use client';

import type { CapiDelivery } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { capiQueryKeys, fetchCapiDeliveries, fetchCapiSources } from '@/lib/api/conversionsApi';
import { Panel, PanelError } from './CapiShared';
import { capiErrorMessage } from './capiHelpers';

const forwardLabel = (delivery: CapiDelivery) =>
  delivery.forwardStatus === null
    ? '—'
    : delivery.forwardStatus === 'delivered'
      ? 'delivered'
      : `failed${delivery.forwardError ? `: ${delivery.forwardError}` : ''}`;

export function CapiDeliveriesTable({ brandId }: { brandId: string }) {
  const deliveries = useQuery({
    queryKey: capiQueryKeys.deliveries(brandId),
    queryFn: () => fetchCapiDeliveries(brandId),
    retry: false,
  });
  // Shares the sources panel's cache; only names the webhook rows.
  const sources = useQuery({
    queryKey: capiQueryKeys.sources(brandId),
    queryFn: () => fetchCapiSources(brandId),
    retry: false,
  });
  const sourceName = (delivery: CapiDelivery) =>
    sources.data?.find((source) => source.id === delivery.sourceId)?.name ?? delivery.source;

  return (
    <Panel title="Recent deliveries" description="Every batch sent to Meta, newest first.">
      {deliveries.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : deliveries.isError ? (
        <PanelError message={capiErrorMessage(deliveries.error, 'Could not load deliveries.')} />
      ) : deliveries.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Test code</TableHead>
                <TableHead>fbtrace_id</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Forward</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.data.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(delivery.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{sourceName(delivery)}</TableCell>
                  <TableCell title={delivery.eventNames.join(', ')}>
                    {delivery.eventCount}
                  </TableCell>
                  <TableCell>{delivery.eventsReceived ?? '—'}</TableCell>
                  <TableCell>
                    {delivery.testEventCode ? (
                      <Badge variant="outline">{delivery.testEventCode}</Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{delivery.fbtraceId ?? '—'}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal text-destructive">
                    {delivery.error ?? ''}
                  </TableCell>
                  <TableCell className="max-w-48 whitespace-normal">
                    {forwardLabel(delivery)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
