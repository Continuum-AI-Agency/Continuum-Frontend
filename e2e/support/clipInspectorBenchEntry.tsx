// The clip inspector, mounted over a real in-memory timeline host.
//
// Everything below the component is the production path: the inspector writes
// `Partial<ClipEffectSpec>` patches, `removeClipBackground` calls the real matte op
// (its real SSE reader, its real contract schema) and `repointClipSource` moves the
// placement onto the returned cutout. Only the HTTP hop is routed by the spec — the
// matte itself runs on a GPU in Cloud Run and has no browser equivalent.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import type { TimelineDocument } from '../../src/StudioCanvas/nodes/timeline/adapter';
import { ClipInspector } from '../../src/StudioCanvas/nodes/timeline/ClipInspector';
import {
  removeClipBackground,
  repointClipSource,
} from '../../src/StudioCanvas/nodes/timeline/clipBackgroundRemoval';
import type { TimelineInputSource } from '../../src/StudioCanvas/types';

const BRAND_ID = '00000000-0000-4000-8000-000000000555';
const SOURCE_ASSET_ID = '11111111-1111-4111-8111-111111111111';

const initialPool: TimelineInputSource[] = [
  {
    nodeId: 'hero-source',
    kind: 'video',
    label: 'Hero',
    sourceAssetId: SOURCE_ASSET_ID,
    previewUrl: 'data:video/mp4;base64,',
    durationSec: 4,
  },
  { nodeId: 'orphan-source', kind: 'video', label: 'Orphan', previewUrl: 'data:video/mp4;base64,' },
];

const initialDocument: TimelineDocument = {
  items: [{ id: 'clip-1', order: 0, sourceNodeId: 'hero-source', kind: 'video' }],
};

function Bench() {
  const [document, setDocument] = useState(initialDocument);
  const [pool, setPool] = useState(initialPool);
  const [removal, setRemoval] = useState<{ pending: boolean; progress: number; error?: string }>({
    pending: false,
    progress: 0,
  });

  const item = document.items[0];
  const source = pool.find((entry) => entry.nodeId === item.sourceNodeId);

  const publish = (next: TimelineDocument, nextPool: TimelineInputSource[]) => {
    setDocument(next);
    setPool(nextPool);
    window.__clipInspectorBench = { document: next, pool: nextPool };
  };
  window.__clipInspectorBench = { document, pool };

  const run = () => {
    if (!source?.sourceAssetId) return;
    setRemoval({ pending: true, progress: 0 });
    removeClipBackground({
      item,
      sourceAssetId: source.sourceAssetId,
      label: `${source.label} (cutout)`,
      brandId: BRAND_ID,
      durationSec: 4,
      deps: { getToken: async () => 'bench-token' },
      onProgress: (progress) => setRemoval((current) => ({ ...current, progress })),
    })
      .then((cutout) => {
        publish(repointClipSource(document, item.id, cutout.nodeId), [...pool, cutout]);
        setRemoval({ pending: false, progress: 1 });
      })
      .catch((error: unknown) => {
        setRemoval({
          pending: false,
          progress: 0,
          error: error instanceof Error ? error.message : 'Background removal failed',
        });
      });
  };

  return (
    <div style={{ width: 340 }}>
      <h2>Clip inspector</h2>
      {/* Two clips, one with a Library asset behind it and one without, so the bench
          can drive both sides of the background-removal gate on one page. */}
      <div>
        {initialPool.map((entry) => (
          <button
            key={entry.nodeId}
            type="button"
            onClick={() => publish(repointClipSource(document, item.id, entry.nodeId), pool)}
          >
            {`Select ${entry.label}`}
          </button>
        ))}
      </div>
      <ClipInspector
        item={item}
        durationSec={4}
        sourceDurationSec={4}
        label={source?.label ?? 'Clip'}
        sourceAssetId={source?.sourceAssetId}
        backgroundRemoval={{ run, ...removal }}
        onTrim={() => undefined}
        onSetStill={() => undefined}
        onSetMute={() => undefined}
        onSetEffects={(patch) => {
          publish(
            {
              ...document,
              items: document.items.map((entry) =>
                entry.id === item.id
                  ? { ...entry, effects: { ...entry.effects, ...patch } }
                  : entry,
              ),
            },
            pool,
          );
        }}
        onSetTransition={() => undefined}
        onClose={() => undefined}
      />
    </div>
  );
}

declare global {
  interface Window {
    __clipInspectorBench: { document: TimelineDocument; pool: TimelineInputSource[] };
  }
}

window.__clipInspectorBench = { document: initialDocument, pool: initialPool };
createRoot(window.document.getElementById('root') as HTMLElement).render(
  <ToastProvider>
    <Bench />
  </ToastProvider>,
);
