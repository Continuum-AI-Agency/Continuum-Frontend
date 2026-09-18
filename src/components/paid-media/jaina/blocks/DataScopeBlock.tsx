'use client';

// The first line of every report: what window, what timezone, what source, what caveats.
// Never buried — a number without its scope is a number the reader cannot trust.

import type { DataScopeBlockV2 } from '@/lib/jaina/schemas';

type DataScopeBlockProps = { block: DataScopeBlockV2; isStreaming: boolean };

const SOURCE_LABEL: Record<DataScopeBlockV2['source'], string> = {
  db: 'synced data',
  api: 'live platform read',
  sheet: 'client sheet',
  mixed: 'synced data + client sheet',
};

export default function DataScopeBlock({ block }: DataScopeBlockProps) {
  return (
    <div
      className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
      data-testid="data-scope-block"
    >
      <p className="text-foreground">
        <span className="font-medium">Scope:</span> {block.dates}
        {block.timezone ? ` · ${block.timezone}` : ''} · {SOURCE_LABEL[block.source]}
      </p>
      {block.notes.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {block.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
