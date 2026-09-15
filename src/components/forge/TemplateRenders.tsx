'use client';

import type { PreviewFormat } from '@/components/forge/FormatPreview';
import { RenderJobsGrid } from '@/components/forge/RenderJobsGrid';
import { Panel } from '@/components/shared/Panel';

// Every render this template has had, on the template itself: grouped by the set that asked for it,
// newest first, and a render opens in place — so "what did this look like last week" never means
// leaving for the ledger and searching for the template's name.

export function TemplateRenders({
  brandId,
  templateKey,
  formats,
}: {
  brandId: string;
  templateKey: string;
  formats?: PreviewFormat[];
}) {
  return (
    <Panel title="Renders" aria-label="Renders">
      <RenderJobsGrid brandId={brandId} templateKey={templateKey} formats={formats} />
    </Panel>
  );
}
