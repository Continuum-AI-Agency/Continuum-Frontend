'use client';

import { useState } from 'react';
import { CapiDeliveriesTable } from './CapiDeliveriesTable';
import { CapiPixelPanel } from './CapiPixelPanel';
import { CapiCsvUploadPanel, CapiSendEventPanel } from './CapiSendPanels';
import { CapiSourcesPanel } from './CapiSourcesPanel';

// Meta Conversions API for one brand: the pixel, three ways in (one event, a CSV, webhook
// sources), and what reached Meta. The first 403 from any write latches the whole section
// read-only, because the Backend's permission is per brand, not per panel.
export function ConversionsApiSection({ brandId }: { brandId: string }) {
  const [readOnly, setReadOnly] = useState(false);
  const panel = { brandId, readOnly, onForbidden: () => setReadOnly(true) };
  return (
    <div className="space-y-4">
      {readOnly ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Read-only: your role on this brand cannot change Conversions API settings or send events.
        </p>
      ) : null}
      <CapiPixelPanel {...panel} />
      <CapiSendEventPanel {...panel} />
      <CapiCsvUploadPanel {...panel} />
      <CapiSourcesPanel {...panel} />
      <CapiDeliveriesTable brandId={brandId} />
    </div>
  );
}
