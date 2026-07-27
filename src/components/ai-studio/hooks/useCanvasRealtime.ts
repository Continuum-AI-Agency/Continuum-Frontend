'use client';

import { migrateStudioWorkflowGraph } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { stringToColor } from '@/lib/utils/color';
import { useStudioStore } from '@/StudioCanvas/stores/useStudioStore';
import type { StudioNode } from '@/StudioCanvas/types';
import { nodeNeedsResign, resignKey } from '@/StudioCanvas/utils/canvasMediaResign';
import { resignCanvasNodes } from '@/StudioCanvas/utils/resignCanvasNodes';
import {
  serializeForBroadcast,
  serializeWorkflowSnapshot,
} from '@/StudioCanvas/utils/workflowSerialization';
import { mergeEdges, mergeNodes } from './merge-strategy';

type CanvasSession = {
  brand_profile_id: string;
  room_id: string;
  nodes: any[];
  edges: any[];
  deleted_node_ids?: string[];
  deleted_edge_ids?: string[];
  updated_at: string;
  revision?: number | null;
  editor_session_id?: string | null;
};

type PresenceUser = {
  user_id: string;
  full_name: string;
  avatar_url: string;
  online_at: string;
  email?: string;
  selected_node_ids?: string[];
  color: string;
};

type RealtimeStatus = 'INITIALIZING' | 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'ERROR';

type CanvasUpdatePayload = {
  nodes: any[];
  edges: any[];
  deleted_node_ids?: string[];
  deleted_edge_ids?: string[];
  updated_at: string;
  revision?: number | null;
  editor_session_id?: string | null;
};
type RemoteUpdateSource = 'realtime' | 'catchup';

const normalizeRealtimeStatus = (value: string): RealtimeStatus =>
  value === 'CHANNEL_ERROR' ? 'ERROR' : (value as RealtimeStatus);

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const formatDbError = (error: unknown): Record<string, unknown> => {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    return { message: e.message, code: e.code, details: e.details, hint: e.hint };
  }
  return { raw: String(error) };
};

// A run interrupted mid-stream (the tab was closed) persists isExecuting:true with
// no isComplete, and nothing reconciles it on load — so the node renders a skeleton
// forever. At load time nothing is actually executing, so any such node is stale:
// clear the flag and surface a retryable error so it offers "Run again" instead.
const reconcileStaleExecutingNodes = (nodes: StudioNode[]): StudioNode[] =>
  nodes.map((node) => {
    const data = node.data as Record<string, unknown> | undefined;
    if (!data || data.isExecuting !== true || data.isComplete === true) return node;
    return {
      ...node,
      data: {
        ...data,
        isExecuting: false,
        error:
          typeof data.error === 'string' && data.error.length > 0
            ? data.error
            : 'Generation was interrupted. Run again to retry.',
      },
    } as StudioNode;
  });

const buildCanvasSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `canvas-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export function useCanvasRealtime(brandProfileId: string, roomId?: string) {
  const supabase = createSupabaseBrowserClient();
  const { user } = useSession();
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, { x: number; y: number; name: string; color: string }>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>('INITIALIZING');
  const [dbStatus, setDbStatus] = useState<RealtimeStatus>('INITIALIZING');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  // Collaborative === another participant is present on the room. Solo edits stay
  // local-authoritative; this only drives status copy, not channel mounting.
  const [isCollaborative, setIsCollaborative] = useState(false);

  const localSessionIdRef = useRef<string>(buildCanvasSessionId());
  const lastUpdateRef = useRef<string | null>(null);
  const lastRevisionRef = useRef<number | null>(null);
  const isRemoteChangeRef = useRef<boolean>(false);
  const broadcastChannelRef = useRef<any>(null);
  const dbChannelRef = useRef<any>(null);
  const lastSyncAtRef = useRef<number>(0);
  const hasLoadedInitialDataRef = useRef<boolean>(false);
  const lastRemoteNodeIdsRef = useRef<Set<string>>(new Set());
  const lastRemoteEdgeIdsRef = useRef<Set<string>>(new Set());
  const pendingSaveRef = useRef<boolean>(false);
  const saveInFlightRef = useRef<boolean>(false);
  const pendingBroadcastPayloadRef = useRef<CanvasUpdatePayload | null>(null);
  const loadedRoomKeyRef = useRef<string | null>(null);
  const syncLatestCanvasSessionRef = useRef<(() => Promise<void>) | null>(null);
  const refillMediaRef = useRef<((nodes: StudioNode[]) => Promise<void>) | null>(null);
  // Durable pointers (bucket\npath) already re-signed this mount — guards against
  // re-signing the same media on every catch-up.
  const resignedPathsRef = useRef<Set<string>>(new Set());
  // True only while another participant is present on the room; solo edits stay
  // local-authoritative. Derived from presence, kept in a ref for stable callbacks.
  const isCollaborativeRef = useRef<boolean>(false);

  const handleRemoteUpdate = useCallback(
    (payload: CanvasUpdatePayload, source: RemoteUpdateSource = 'realtime') => {
      const remoteTimestamp = payload.updated_at;
      const localTimestamp = lastUpdateRef.current;
      const remoteRevision = toFiniteNumber(payload.revision);
      const localRevision = lastRevisionRef.current;

      // Self-echo immunity: postgres_changes has no self-filter, so this client
      // receives its OWN persist-stripped UPDATE. Applying it would merge a row
      // with the media fields removed over the freshly generated local node. Drop
      // any live event we authored. Catch-up is an explicit re-read we still want
      // (its missing URLs are refilled by the re-sign pass below).
      const incomingEditorSessionId = payload.editor_session_id ?? null;
      if (
        source !== 'catchup' &&
        incomingEditorSessionId !== null &&
        incomingEditorSessionId === localSessionIdRef.current
      ) {
        return;
      }

      const hasNodeArray = Array.isArray(payload.nodes);
      const hasEdgeArray = Array.isArray(payload.edges);
      if (!hasNodeArray || !hasEdgeArray) {
        console.warn('[Canvas Sync] Ignoring malformed payload and requesting catch-up', {
          source,
          hasNodeArray,
          hasEdgeArray,
          timestamp: remoteTimestamp,
        });
        if (source === 'realtime') {
          void syncLatestCanvasSessionRef.current?.();
        }
        return;
      }

      const migrated = migrateStudioWorkflowGraph({ nodes: payload.nodes, edges: payload.edges });
      const remoteNodes = migrated.graph.nodes as StudioNode[];
      const remoteEdges = migrated.graph.edges as Edge[];
      const remoteDeletedNodeIds = toStringArray(payload.deleted_node_ids);
      const remoteDeletedEdgeIds = toStringArray(payload.deleted_edge_ids);

      if (remoteRevision !== null && localRevision !== null) {
        if (remoteRevision < localRevision) {
          return;
        }
        if (remoteRevision === localRevision) {
          return;
        }
      }

      if (remoteRevision === null) {
        if (remoteTimestamp && localTimestamp && remoteTimestamp === localTimestamp) {
          return;
        }

        const isRemoteNewer =
          !localTimestamp || new Date(remoteTimestamp) >= new Date(localTimestamp);
        if (!isRemoteNewer) return;
      }

      const store = useStudioStore.getState();

      const hasDeleteSignal = remoteDeletedNodeIds.length > 0 || remoteDeletedEdgeIds.length > 0;
      const violatesClearInvariant =
        source === 'realtime' &&
        remoteNodes.length === 0 &&
        remoteEdges.length === 0 &&
        !hasDeleteSignal &&
        (store.nodes.length > 0 || store.edges.length > 0) &&
        (lastRemoteNodeIdsRef.current.size > 0 || lastRemoteEdgeIdsRef.current.size > 0);

      if (violatesClearInvariant) {
        console.warn('[Canvas Sync] Ignoring invalid clear event and requesting catch-up', {
          timestamp: remoteTimestamp,
          revision: remoteRevision,
        });
        void syncLatestCanvasSessionRef.current?.();
        return;
      }

      const mergedNodes = mergeNodes(
        store.nodes,
        remoteNodes,
        remoteDeletedNodeIds,
        lastRemoteNodeIdsRef.current,
      );
      const mergedEdges = mergeEdges(
        store.edges,
        remoteEdges,
        remoteDeletedEdgeIds,
        lastRemoteEdgeIdsRef.current,
      );

      console.log('[Canvas Sync] State merged', {
        nodes: mergedNodes.length,
        timestamp: remoteTimestamp,
        revision: remoteRevision ?? 'legacy',
      });

      isRemoteChangeRef.current = true;
      store.setNodes(mergedNodes);
      store.setEdges(mergedEdges);
      // A merged row may carry durable storage pointers but no signed URL (the
      // persisted snapshot strips expiring URLs). Re-sign those so generated media
      // never renders blank after a sync round-trip.
      void refillMediaRef.current?.(mergedNodes);
      lastUpdateRef.current = remoteTimestamp;
      lastRevisionRef.current = remoteRevision;

      lastRemoteNodeIdsRef.current = new Set(remoteNodes.map((n: any) => n.id));
      lastRemoteEdgeIdsRef.current = new Set(remoteEdges.map((e: any) => e.id));

      setTimeout(() => {
        isRemoteChangeRef.current = false;
      }, 100);
    },
    [],
  );

  const syncLatestCanvasSession = useCallback(async () => {
    if (!brandProfileId || !roomId) return;

    const { data, error } = await supabase
      .schema('brand_profiles' as any)
      .from('canvas_sessions' as any)
      .select('*')
      .eq('brand_profile_id', brandProfileId)
      .eq('room_id', roomId)
      .maybeSingle();

    if (error) {
      console.error('[Canvas Sync] Catch-up load failed', formatDbError(error));
      return;
    }

    if (!data) return;
    const session = data as unknown as CanvasSession;
    handleRemoteUpdate(
      {
        nodes: session.nodes || [],
        edges: session.edges || [],
        deleted_node_ids: session.deleted_node_ids || [],
        deleted_edge_ids: session.deleted_edge_ids || [],
        updated_at: session.updated_at,
        revision: session.revision ?? null,
        editor_session_id: session.editor_session_id ?? null,
      },
      'catchup',
    );
  }, [brandProfileId, roomId, supabase, handleRemoteUpdate]);

  // Presence heartbeat: record which room this user is actively viewing so the
  // MCP co-pilot can target the live canvas (resolveCanvasRoom). Best-effort.
  useEffect(() => {
    if (!brandProfileId || !roomId) return;
    let cancelled = false;

    const beat = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId || cancelled) return;
      await supabase
        .schema('brand_profiles' as any)
        .from('canvas_active_view' as any)
        .upsert(
          {
            user_id: userId,
            brand_profile_id: brandProfileId,
            room_id: roomId,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,brand_profile_id' },
        );
    };

    void beat();
    const interval = setInterval(() => void beat(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [brandProfileId, roomId, supabase]);

  useEffect(() => {
    syncLatestCanvasSessionRef.current = syncLatestCanvasSession;
    return () => {
      syncLatestCanvasSessionRef.current = null;
    };
  }, [syncLatestCanvasSession]);

  // Re-sign generated/reference media that arrived from a sync merge with its
  // signed URL stripped. Batched (one POST) and de-duped per durable pointer so
  // repeated catch-ups never trigger a re-sign storm.
  const refillMissingMediaUrls = useCallback(
    async (mergedNodes: StudioNode[]) => {
      const pending = mergedNodes.filter((node) => {
        if (!nodeNeedsResign(node)) return false;
        const key = resignKey(node);
        return key ? !resignedPathsRef.current.has(key) : false;
      });
      if (pending.length === 0) return;

      const resigned = await resignCanvasNodes(pending, brandProfileId);
      const resignedById = new Map(resigned.map((node) => [node.id, node]));

      let changed = false;
      const next = mergedNodes.map((node) => {
        const updated = resignedById.get(node.id);
        // resignCanvasNodes returns a new node object only when a URL was applied;
        // an unchanged reference means the sign failed — leave it for a later retry.
        if (!updated || updated.data === node.data) return node;
        const key = resignKey(updated);
        if (key) resignedPathsRef.current.add(key);
        changed = true;
        return updated;
      });
      if (!changed) return;

      isRemoteChangeRef.current = true;
      useStudioStore.getState().setNodes(next);
      setTimeout(() => {
        isRemoteChangeRef.current = false;
      }, 100);
    },
    [brandProfileId],
  );

  useEffect(() => {
    refillMediaRef.current = refillMissingMediaUrls;
    return () => {
      refillMediaRef.current = null;
    };
  }, [refillMissingMediaUrls]);

  useEffect(() => {
    const collaborative = onlineUsers.some((participant) => participant.user_id !== user?.id);
    isCollaborativeRef.current = collaborative;
    setIsCollaborative(collaborative);
  }, [onlineUsers, user?.id]);

  useEffect(() => {
    if (!brandProfileId || !roomId) {
      pendingBroadcastPayloadRef.current = null;
      pendingSaveRef.current = false;
      lastRevisionRef.current = null;
      if (!roomId) setIsLoading(false);
      return;
    }

    const roomKey = `${brandProfileId}:${roomId}`;
    const isRoomSwitch = loadedRoomKeyRef.current !== null && loadedRoomKeyRef.current !== roomKey;
    loadedRoomKeyRef.current = roomKey;
    let cancelled = false;

    if (isRoomSwitch) {
      pendingBroadcastPayloadRef.current = null;
      pendingSaveRef.current = false;
      lastRevisionRef.current = null;
      lastRemoteNodeIdsRef.current = new Set();
      lastRemoteEdgeIdsRef.current = new Set();
      useStudioStore.getState().resetForRoomSwitch();
    }

    const loadInitialState = async () => {
      setIsLoading(true);
      hasLoadedInitialDataRef.current = false;

      const { data, error } = await supabase
        .schema('brand_profiles' as any)
        .from('canvas_sessions' as any)
        .select('*')
        .eq('brand_profile_id', brandProfileId)
        .eq('room_id', roomId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('[Canvas Sync] Load failed', formatDbError(error));
        hasLoadedInitialDataRef.current = true;
        setIsLoading(false);
        return;
      }

      // Unsaved local work (drawn before a room existed, or before this load
      // resolved) must never be clobbered by a hard load of an older/empty row.
      const hadLocalContent = useStudioStore.getState().nodes.length > 0;

      if (data) {
        const session = data as unknown as CanvasSession;
        isRemoteChangeRef.current = true;
        hasLoadedInitialDataRef.current = true;

        const migrated = migrateStudioWorkflowGraph({
          nodes: session.nodes || [],
          edges: session.edges || [],
        });
        const rawNodes = migrated.graph.nodes as StudioNode[];
        const resignedNodes = reconcileStaleExecutingNodes(
          await resignCanvasNodes(rawNodes, brandProfileId),
        );

        const store = useStudioStore.getState();
        if (hadLocalContent) {
          // Adopt-up: merge the persisted baseline into the live local canvas so
          // freshly generated media survives the room being adopted.
          store.setNodes(mergeNodes(store.nodes, resignedNodes, [], lastRemoteNodeIdsRef.current));
          store.setEdges(
            mergeEdges(
              store.edges,
              migrated.graph.edges as Edge[],
              [],
              lastRemoteEdgeIdsRef.current,
            ),
          );
        } else {
          store.setNodes(resignedNodes);
          store.setEdges(migrated.graph.edges as Edge[]);
        }
        lastUpdateRef.current = session.updated_at;
        lastRevisionRef.current = toFiniteNumber(session.revision);

        lastRemoteNodeIdsRef.current = new Set(migrated.graph.nodes.map((node) => node.id));
        lastRemoteEdgeIdsRef.current = new Set(migrated.graph.edges.map((edge) => edge.id));

        setTimeout(() => {
          isRemoteChangeRef.current = false;
          setIsLoading(false);
        }, 100);
      } else if (hadLocalContent) {
        // No persisted row yet but the user has local work: adopt it as this
        // room's first revision instead of wiping. The pending-save drain
        // persists it once loading flips false.
        hasLoadedInitialDataRef.current = true;
        lastRevisionRef.current = null;
        pendingSaveRef.current = true;
        setIsLoading(false);
      } else {
        hasLoadedInitialDataRef.current = true;
        setIsLoading(false);
        lastRevisionRef.current = null;
        const store = useStudioStore.getState();
        store.setNodes([]);
        store.setEdges([]);
      }
    };

    loadInitialState();
    return () => {
      cancelled = true;
    };
  }, [brandProfileId, roomId, supabase]);

  useEffect(() => {
    if (!brandProfileId || !roomId) return;

    const channelTopic = `canvas:broadcast:${brandProfileId}:${roomId}`;
    console.log('[Canvas Sync] Creating broadcast channel:', channelTopic);

    const channel = supabase.channel(channelTopic, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast' as any, { event: 'canvas_updated' }, ({ payload }: any) => {
        console.log('[Canvas Sync] Broadcast update received');
        handleRemoteUpdate(payload);
      })
      .on('broadcast' as any, { event: 'cursor' }, ({ payload }: any) => {
        setRemoteCursors((prev) => ({
          ...prev,
          [payload.userId]: {
            x: payload.x,
            y: payload.y,
            name: payload.name,
            color: payload.color,
          },
        }));
      })
      .on('presence' as any, { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        Object.values(state).forEach((entries: any) => {
          entries.forEach((entry: any) => users.push(entry as PresenceUser));
        });
        setOnlineUsers(users);
      })
      .on('presence' as any, { event: 'leave' }, ({ leftPresences }: any) => {
        setRemoteCursors((prev) => {
          const next = { ...prev };
          leftPresences.forEach((p: any) => delete next[p.user_id]);
          return next;
        });
      })
      .subscribe((subStatus, err) => {
        console.log('[Canvas Sync] Broadcast channel status:', subStatus);
        if (err) console.error('[Canvas Sync] Broadcast error:', err);
        setStatus(normalizeRealtimeStatus(subStatus));
      });

    broadcastChannelRef.current = channel;

    return () => {
      console.log('[Canvas Sync] Tearing down broadcast channel');
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
      pendingBroadcastPayloadRef.current = null;
    };
  }, [brandProfileId, roomId, supabase, handleRemoteUpdate]);

  useEffect(() => {
    if (!brandProfileId || !roomId) return;

    const channelTopic = `canvas:db:${brandProfileId}:${roomId}`;
    console.log('[Canvas Sync] Creating DB channel:', channelTopic);

    const channel = supabase.channel(channelTopic, {
      config: { broadcast: { self: false } },
    });

    channel
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'brand_profiles',
          table: 'canvas_sessions',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          const record = payload.new || payload.old;
          if (record?.brand_profile_id !== brandProfileId) return;

          console.log('[Canvas Sync] Postgres Change:', payload.eventType);

          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            handleRemoteUpdate({
              nodes: payload.new.nodes,
              edges: payload.new.edges,
              deleted_node_ids: payload.new.deleted_node_ids,
              deleted_edge_ids: payload.new.deleted_edge_ids,
              updated_at: payload.new.updated_at,
              revision: payload.new.revision,
              editor_session_id: payload.new.editor_session_id,
            });
          } else if (payload.eventType === 'DELETE') {
            const store = useStudioStore.getState();
            if (store.nodes.length === 0 && store.edges.length === 0) {
              lastRemoteNodeIdsRef.current = new Set();
              lastRemoteEdgeIdsRef.current = new Set();
              lastRevisionRef.current = null;
            } else {
              // Keep unsaved local work (which may include freshly generated
              // media) and re-persist it instead of hard-reloading the page.
              console.warn('[Canvas Sync] Ignoring canvas_sessions DELETE; preserving local work');
              lastRevisionRef.current = null;
              store.triggerSave?.();
            }
          }
        },
      )
      .subscribe((subStatus, err) => {
        console.log('[Canvas Sync] DB channel status:', subStatus);
        if (err) console.error('[Canvas Sync] DB Realtime error:', err);
        const normalizedStatus = normalizeRealtimeStatus(subStatus);
        setDbStatus(normalizedStatus);
        if (subStatus === 'SUBSCRIBED') {
          const now = Date.now();
          if (now - lastSyncAtRef.current > 2000) {
            lastSyncAtRef.current = now;
            void syncLatestCanvasSession();
          }
        }
      });

    dbChannelRef.current = channel;

    return () => {
      console.log('[Canvas Sync] Tearing down DB channel');
      supabase.removeChannel(channel);
      dbChannelRef.current = null;
    };
  }, [brandProfileId, roomId, supabase, handleRemoteUpdate, syncLatestCanvasSession]);

  useEffect(() => {
    if (status === 'SUBSCRIBED' && user && broadcastChannelRef.current) {
      broadcastChannelRef.current.track({
        user_id: user.id,
        full_name: user.user_metadata?.full_name || user.email || 'Anonymous',
        avatar_url: user.user_metadata?.avatar_url || '',
        email: user.email || '',
        selected_node_ids: [],
        color: stringToColor(user.id),
        online_at: new Date().toISOString(),
      });
    }
  }, [status, user]);

  const saveCanvasToDatabase = useCallback(async () => {
    if (!brandProfileId || !roomId) return;
    if (!hasLoadedInitialDataRef.current || saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const maxAttempts = 4;
      let saved:
        | {
            data: Record<string, unknown>;
            state: ReturnType<typeof useStudioStore.getState>;
            nodes: StudioNode[];
            edges: Edge[];
            defaultEdgeType: ReturnType<typeof useStudioStore.getState>['defaultEdgeType'];
            deletedNodeIds: string[];
            deletedEdgeIds: string[];
            serialized: ReturnType<typeof serializeWorkflowSnapshot>;
          }
        | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const state = useStudioStore.getState();
        const currentNodes = state.nodes;
        const currentEdges = state.edges;
        const defaultEdgeType = state.defaultEdgeType;
        const deletedNodeIds = state.getDeletedNodeIds();
        const deletedEdgeIds = state.getDeletedEdgeIds();
        const serialized = serializeWorkflowSnapshot(currentNodes, currentEdges, defaultEdgeType);
        const payload = {
          brand_profile_id: brandProfileId,
          room_id: roomId,
          nodes: serialized.nodes as any,
          edges: serialized.edges as any,
          deleted_node_ids: deletedNodeIds,
          deleted_edge_ids: deletedEdgeIds,
          editor_session_id: localSessionIdRef.current,
          editor_user_id: user?.id ?? null,
        };
        const expectedRevision = lastRevisionRef.current;
        const table = supabase.schema('brand_profiles' as any).from('canvas_sessions' as any);
        const result =
          expectedRevision === null
            ? await table
                .insert(payload)
                .select('updated_at, revision, editor_session_id')
                .maybeSingle()
            : await table
                .update(payload)
                .eq('brand_profile_id', brandProfileId)
                .eq('room_id', roomId)
                .eq('revision', expectedRevision)
                .select('updated_at, revision, editor_session_id')
                .maybeSingle();

        if (result.error && (result.error as { code?: string }).code !== '23505') {
          console.error('[Canvas Sync] Save failed', formatDbError(result.error));
          return;
        }
        if (result.data) {
          saved = {
            data: result.data as Record<string, unknown>,
            state,
            nodes: currentNodes,
            edges: currentEdges,
            defaultEdgeType,
            deletedNodeIds,
            deletedEdgeIds,
            serialized,
          };
          break;
        }

        // A missing UPDATE row or duplicate INSERT means another writer won the
        // revision. Reconcile that row into the store, then serialize and retry
        // against its new revision instead of overwriting it with stale state.
        await syncLatestCanvasSessionRef.current?.();
      }

      if (!saved) {
        console.warn('[Canvas Sync] Save deferred after repeated revision conflicts');
        return;
      }

      {
        const {
          data,
          state,
          nodes: currentNodes,
          edges: currentEdges,
          defaultEdgeType,
          deletedNodeIds,
          deletedEdgeIds,
          serialized,
        } = saved;
        const resolvedTimestamp = (data as any).updated_at as string;
        const resolvedRevision = toFiniteNumber((data as any).revision);
        const resolvedEditorSessionId = ((data as any).editor_session_id ??
          localSessionIdRef.current) as string;

        lastUpdateRef.current = resolvedTimestamp;
        lastRevisionRef.current = resolvedRevision;

        // Broadcast a base64-stripped snapshot that KEEPS signed URLs — never the
        // raw store nodes. Inlined media (base64 data URIs) would blow past
        // Realtime's max message size and close the shared socket with code 1009.
        // Keeping the signed URLs lets peers render media instantly (no re-sign
        // round-trip); base64-only nodes fall back to mergeNodes preserving local
        // media when the field is omitted.
        const broadcastSnapshot = serializeForBroadcast(
          currentNodes,
          currentEdges,
          defaultEdgeType,
        );
        const syncPayload: CanvasUpdatePayload = {
          nodes: broadcastSnapshot.nodes as any[],
          edges: broadcastSnapshot.edges as any[],
          deleted_node_ids: deletedNodeIds,
          deleted_edge_ids: deletedEdgeIds,
          updated_at: resolvedTimestamp,
          revision: resolvedRevision,
          editor_session_id: resolvedEditorSessionId,
        };

        lastRemoteNodeIdsRef.current = new Set(serialized.nodes.map((n: any) => n.id));
        lastRemoteEdgeIdsRef.current = new Set(serialized.edges.map((e: any) => e.id));

        if (broadcastChannelRef.current && status === 'SUBSCRIBED') {
          broadcastChannelRef.current.send({
            type: 'broadcast',
            event: 'canvas_updated',
            payload: syncPayload,
          });
        } else {
          pendingBroadcastPayloadRef.current = syncPayload;
        }

        state.clearDeletedIds(deletedNodeIds, deletedEdgeIds);
      }
    } catch (err) {
      console.error('[Canvas Sync] Save error', err);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void saveCanvasToDatabase();
      }
    }
  }, [brandProfileId, roomId, supabase, status, user?.id]);

  const saveTrigger = useStudioStore((state) => state.saveTrigger);
  useEffect(() => {
    if (saveTrigger > 0) {
      void saveCanvasToDatabase();
    }
  }, [saveTrigger, saveCanvasToDatabase]);

  useEffect(() => {
    if (
      !isLoading &&
      hasLoadedInitialDataRef.current &&
      pendingSaveRef.current &&
      !saveInFlightRef.current
    ) {
      pendingSaveRef.current = false;
      void saveCanvasToDatabase();
    }
  }, [isLoading, saveCanvasToDatabase]);

  useEffect(() => {
    if (
      status !== 'SUBSCRIBED' ||
      !broadcastChannelRef.current ||
      !pendingBroadcastPayloadRef.current
    ) {
      return;
    }

    broadcastChannelRef.current.send({
      type: 'broadcast',
      event: 'canvas_updated',
      payload: pendingBroadcastPayloadRef.current,
    });
    pendingBroadcastPayloadRef.current = null;
  }, [status]);

  const lastCursorSendRef = useRef<number>(0);
  const updateCursor = useCallback(
    (x: number, y: number) => {
      if (!user || !broadcastChannelRef.current || status !== 'SUBSCRIBED') return;
      const now = Date.now();
      if (now - lastCursorSendRef.current < 50) return;
      lastCursorSendRef.current = now;

      broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'cursor',
        payload: {
          userId: user.id,
          x,
          y,
          name: user.user_metadata?.full_name || user.email || 'Anonymous',
          color: stringToColor(user.id),
        },
      });
    },
    [user, status],
  );

  const updatePresence = useCallback(
    (nodeIds: string[]) => {
      if (!user || !broadcastChannelRef.current || status !== 'SUBSCRIBED') return;
      const sortedNew = [...nodeIds].sort().join(',');
      const sortedCurrent = [...selectedNodeIds].sort().join(',');
      if (sortedNew === sortedCurrent) return;

      setSelectedNodeIds(nodeIds);
      broadcastChannelRef.current.track({
        user_id: user.id,
        full_name: user.user_metadata?.full_name || user.email || 'Anonymous',
        avatar_url: user.user_metadata?.avatar_url || '',
        email: user.email || '',
        selected_node_ids: nodeIds,
        color: stringToColor(user.id),
        online_at: new Date().toISOString(),
      });
    },
    [user, selectedNodeIds, status],
  );

  return {
    remoteCursors,
    updateCursor,
    updatePresence,
    isLoading,
    onlineUsers,
    status,
    dbStatus,
    isCollaborative,
    isSaving,
    saveCanvasToDatabase,
  };
}
