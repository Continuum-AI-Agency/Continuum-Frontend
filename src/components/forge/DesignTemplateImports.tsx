'use client';

import type { DesignImportResponse } from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';
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
  const uiErrorText = useUiErrorMessage();

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
          error: uiErrorText(error),
        });
      } finally {
        running.current.delete(key);
      }
    },
    [brandId, uiErrorText],
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
  const translateUi = useUiTranslations('forge');

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
                  ? translateUi('making_your_template_4610bddc')
                  : item.result?.parseState === 'failed'
                    ? translateUi('the_template_was_created_but_could__ada17d65')
                    : item.result?.parseState === 'pending'
                      ? translateUi('reading_template_layers_e90bf666')
                      : translateUi('template_imported_open_it_to_check__e5fbd6be')}
            </p>
          </div>
          {item.state === 'error' ? (
            <Button type="button" size="sm" onClick={() => void onRetry(item.name, item.assetId)}>
              {' '}
              {translateUi('retry_942087cc')} {item.name}
            </Button>
          ) : null}
          {item.result && onOpen ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpen(item.result!.assetId)}
            >
              {' '}
              {translateUi('open_template_42b4387d')}{' '}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
