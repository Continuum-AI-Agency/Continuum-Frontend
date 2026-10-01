'use client';

import type { DesignImportResponse } from '@continuum/contracts';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { importDesignTemplate } from '@/lib/library/templateSources';

type DesignImport = {
  brandId: string;
  assetId: string;
  name: string;
  state: 'importing' | 'imported' | 'error';
  result?: DesignImportResponse;
  error?: string;
};

/** Uploads finish before conversion. Keep that second step visible and retry its saved asset. */
export function useDesignTemplateImports(
  brandId: string,
  onImported: (result: DesignImportResponse) => Promise<void> | void,
) {
  const [items, setItems] = useState<DesignImport[]>([]);
  const running = useRef(new Set<string>());
  const current = useRef({ brandId, onImported });
  current.current = { brandId, onImported };
  const start = useCallback(
    async (name: string, assetId: string) => {
      const key = `${brandId}:${assetId}`;
      if (running.current.has(key)) return;
      running.current.add(key);
      const update = (item: DesignImport) =>
        setItems((old) => [
          ...old.filter((entry) => entry.brandId !== brandId || entry.assetId !== assetId),
          item,
        ]);
      update({ brandId, assetId, name, state: 'importing' });
      try {
        const result = await importDesignTemplate(brandId, assetId);
        update({ brandId, assetId, name, state: 'imported', result });
        if (current.current.brandId === brandId) await current.current.onImported(result);
      } catch (error) {
        update({
          brandId,
          assetId,
          name,
          state: 'error',
          error:
            error instanceof Error ? error.message : 'Could not make this template. Try again.',
        });
      } finally {
        running.current.delete(key);
      }
    },
    [brandId],
  );
  return { imports: items.filter((item) => item.brandId === brandId), start };
}

export function DesignTemplateImports({
  imports,
  onRetry,
  sourceIds = [],
  onOpen,
}: {
  imports: DesignImport[];
  onRetry: (name: string, assetId: string) => Promise<void>;
  sourceIds?: string[];
  onOpen?: (assetId: string) => void;
}) {
  const visible = imports.filter(
    (item) => !item.result || !sourceIds.includes(item.result.assetId),
  );
  if (!visible.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {visible.map((item) => (
        <div
          key={item.assetId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
        >
          <div>
            <strong>{item.name}</strong>
            <p
              role={item.state === 'error' ? 'alert' : 'status'}
              className={item.state === 'error' ? 'text-destructive' : 'text-muted-foreground'}
            >
              {item.state === 'error'
                ? item.error
                : item.state === 'importing'
                  ? 'Making your template…'
                  : item.result?.parseState === 'failed'
                    ? 'The template was created but could not be read. Open it to review the file.'
                    : item.result?.parseState === 'pending'
                      ? 'Reading template layers…'
                      : 'Template imported. Open it to check required fonts.'}
            </p>
          </div>
          {item.state === 'error' ? (
            <Button type="button" size="sm" onClick={() => void onRetry(item.name, item.assetId)}>
              Retry {item.name}
            </Button>
          ) : null}
          {item.result && onOpen ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpen(item.result!.assetId)}
            >
              Open template
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
