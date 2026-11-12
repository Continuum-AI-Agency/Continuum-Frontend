'use client';

import { useCallback, useState } from 'react';
import { EXPORT_BENCH_REPORT } from '@/components/paid-media/jaina/export/__fixtures__/report';
import {
  renderExportDocument,
  serializeExportDocument,
} from '@/components/paid-media/jaina/export/renderExportDocument';

type State = 'idle' | 'building' | 'ready' | 'failed';

declare global {
  interface Window {
    __jainaExportHtml?: string;
  }
}

// Harness for `jaina:report:export:e2e:bench`, and a visual-QA surface for the
// export layout. It drives the REAL `renderExportDocument` against a report parsed
// by the real schema, leaves the export frame mounted so the bench can assert the
// composed document, and publishes the serialized HTML so the bench can print the
// exact bytes a user would get. Not linked from any nav.
export function JainaReportExportPreview() {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async () => {
    setState('building');
    setError(null);
    document
      .querySelectorAll('[data-jaina-export-frame]')
      .forEach((frame) => frame.remove());
    try {
      const handle = await renderExportDocument({
        report: EXPORT_BENCH_REPORT,
        blocks: [...EXPORT_BENCH_REPORT.blocks].sort((a, b) => a.priority - b.priority),
        title: 'Performance Report',
      });
      window.__jainaExportHtml = serializeExportDocument(handle.doc);
      // Deliberately NOT cleaned up: the bench inspects the live frame.
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('failed');
    }
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8" data-export-state={state}>
      <h1 className="text-lg font-semibold">Jaina report export harness</h1>
      <p className="text-sm text-muted-foreground">
        Builds the export document from a fixture report covering every block category.
      </p>
      <button
        type="button"
        onClick={() => void build()}
        className="rounded-md border border-border px-3 py-1.5 text-sm"
      >
        Build export document
      </button>
      {error ? (
        <p data-export-error className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </main>
  );
}
