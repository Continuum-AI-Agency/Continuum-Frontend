'use client';

import type { CapiDelivery } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { capiQueryKeys, fetchCapiDeliveries, fetchCapiSources } from '@/lib/api/conversionsApi';
import { Panel, PanelError } from './CapiShared';
import { capiErrorMessage } from './capiHelpers';

export function CapiDeliveriesTable({ brandId }: { brandId: string }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const formatUiError = useUiErrorMessage();
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
    <Panel
      title={uiText('recent_deliveries_9d067ec')}
      description={uiText('every_batch_sent_to_meta_newest_first_d78f524')}
    >
      {deliveries.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : deliveries.isError ? (
        <PanelError
          message={capiErrorMessage(deliveries.error, 'Could not load deliveries.', uiText)}
        />
      ) : deliveries.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">{uiText('nothing_sent_yet_a5ff063')}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>{uiText('time_33b9347')}</TableHead>
                <TableHead>{uiText('source_0e570ca')}</TableHead>
                <TableHead>{uiText('events_8d14f6e')}</TableHead>
                <TableHead>{uiText('received_49f19be')}</TableHead>
                <TableHead>{uiText('test_code_779c145')}</TableHead>
                <TableHead>fbtrace_id</TableHead>
                <TableHead>{uiText('error_54a0e8c')}</TableHead>
                <TableHead>{uiText('forward_f1c65e1')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.data.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(delivery.createdAt).toLocaleString(uiLocale)}
                  </TableCell>
                  <TableCell>{sourceName(delivery)}</TableCell>
                  <TableCell title={delivery.eventNames.join(', ')}>
                    {delivery.eventCount.toLocaleString(uiLocale)}
                  </TableCell>
                  <TableCell>{delivery.eventsReceived?.toLocaleString(uiLocale) ?? '—'}</TableCell>
                  <TableCell>
                    {delivery.testEventCode ? (
                      <Badge variant="outline">{delivery.testEventCode}</Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{delivery.fbtraceId ?? '—'}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal text-destructive">
                    {delivery.error ? (
                      <details>
                        <summary>{formatUiError(new Error(delivery.error))}</summary>
                        <code>{delivery.error}</code>
                      </details>
                    ) : (
                      ''
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 whitespace-normal">
                    {delivery.forwardStatus == null
                      ? '—'
                      : uiText('capiForwardState', { state: delivery.forwardStatus })}
                    {delivery.forwardError ? (
                      <details>
                        <summary>{uiText('capiDiagnosticDetails')}</summary>
                        <code>{delivery.forwardError}</code>
                      </details>
                    ) : null}
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
