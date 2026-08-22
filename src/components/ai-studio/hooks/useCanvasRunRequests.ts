'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { useWorkflowExecution } from '@/StudioCanvas/hooks/useWorkflowExecution';
import { useStudioStore } from '@/StudioCanvas/stores/useStudioStore';
import { executeWorkflow } from '@/StudioCanvas/utils/executeWorkflow';
import { type RunNode, type RunRequestStore, runCanvasRequest } from '../canvasRunRequests';

type BrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

// Adapter binding the testable RunRequestStore to the live canvas_run_requests table.
function createSupabaseRunRequestStore(supabase: BrowserClient): RunRequestStore {
  const table = () => supabase.schema('brand_profiles').from('canvas_run_requests');
  return {
    async claim(runRequestId) {
      const { data, error } = await table()
        .update({ status: 'running' })
        .eq('id', runRequestId)
        .eq('status', 'pending')
        .select('id');
      if (error)
        throw new Error(`Failed to claim canvas run request ${runRequestId}: ${error.message}`);
      return Array.isArray(data) && data.length > 0;
    },
    async markDone(runRequestId, result) {
      const { error } = await table().update({ status: 'done', result }).eq('id', runRequestId);
      if (error)
        throw new Error(`Failed to finalize canvas run request ${runRequestId}: ${error.message}`);
    },
    async markError(runRequestId, message) {
      const { error } = await table()
        .update({ status: 'error', error: message })
        .eq('id', runRequestId);
      if (error) console.error('[Canvas Runs] Failed to record run error', error);
    },
  };
}

// Subscribes the open canvas to MCP-issued run requests for the active room and
// executes them locally, persisting + broadcasting results through the normal
// autosave path. A pending->running claim guard ensures only one open client runs
// a given request when several have the room open.
export function useCanvasRunRequests(brandProfileId: string, roomId: string | undefined): void {
  const supabase = createSupabaseBrowserClient();
  const controls = useWorkflowExecution();
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!brandProfileId || !roomId) return;

    const store = createSupabaseRunRequestStore(supabase);

    // The old channel carried `config: { broadcast: { self: false } }` with no broadcast
    // binding on it — cargo cult from the sibling canvas channel. Dropped, not threaded.
    return subscribeToPostgresChanges({
      label: `canvas:runs:${brandProfileId}:${roomId}`,
      bindings: [
        {
          event: 'INSERT',
          schema: 'brand_profiles',
          table: 'canvas_run_requests',
          filter: `room_id=eq.${roomId}`,
          onRow: (row) => {
            if (row.brand_profile_id !== brandProfileId || row.status !== 'pending') return;
            const runRequestId = typeof row.id === 'string' ? row.id : null;
            if (!runRequestId || handledRef.current.has(runRequestId)) return;
            handledRef.current.add(runRequestId);

            const requestedNodeIds = Array.isArray(row.node_ids)
              ? (row.node_ids as string[])
              : null;
            void runCanvasRequest({
              store,
              runRequestId,
              requestedNodeIds,
              roomId,
              brandId: useStudioStore.getState().brandId ?? brandProfileId,
              getNodes: () => useStudioStore.getState().nodes as RunNode[],
              execute: (opts) => executeWorkflow(controlsRef.current, opts),
            });
          },
        },
      ],
      onStatus: (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Canvas Runs] DB channel status:', status);
        }
      },
    });
  }, [brandProfileId, roomId, supabase]);
}
