"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useStudioStore } from "@/StudioCanvas/stores/useStudioStore";
import { useSession } from "@/hooks/useSession";
import type { StudioNode } from "@/StudioCanvas/types";
import type { Edge } from "@xyflow/react";
import { stringToColor } from "@/lib/utils/color";
import { mergeNodes, mergeEdges } from "./merge-strategy";
import { serializeWorkflowSnapshot } from "@/StudioCanvas/utils/workflowSerialization";

type CanvasSession = {
  brand_profile_id: string;
  nodes: any[];
  edges: any[];
  updated_at: string;
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

type RealtimeStatus = "INITIALIZING" | "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "ERROR";

export function useCanvasRealtime(brandProfileId: string) {
  const supabase = createSupabaseBrowserClient();
  const { user } = useSession();
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, { x: number; y: number; name: string; color: string }>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>("INITIALIZING");
  const [dbStatus, setDbStatus] = useState<RealtimeStatus>("INITIALIZING");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const lastUpdateRef = useRef<string | null>(null);
  const isRemoteChangeRef = useRef<boolean>(false);
  const broadcastChannelRef = useRef<any>(null);
  const dbChannelRef = useRef<any>(null);
  const hasLoadedInitialDataRef = useRef<boolean>(false);
  const lastRemoteNodeIdsRef = useRef<Set<string>>(new Set());
  const lastRemoteEdgeIdsRef = useRef<Set<string>>(new Set());

  // Stable reference for the update handler to prevent binding mismatches
  const handleRemoteUpdate = useCallback((payload: { 
    nodes: any[], 
    edges: any[], 
    deleted_node_ids?: string[], 
    deleted_edge_ids?: string[], 
    updated_at: string 
  }) => {
    const remoteTimestamp = payload.updated_at;
    const localTimestamp = lastUpdateRef.current;

    // Exact timestamp match means it is our own change returning via Postgres
    if (remoteTimestamp && localTimestamp && remoteTimestamp === localTimestamp) {
      return;
    }

    // Protect against out-of-order delivery
    const isRemoteNewer = !localTimestamp || new Date(remoteTimestamp) >= new Date(localTimestamp);
    if (!isRemoteNewer) return;

    const store = useStudioStore.getState();
    
    const mergedNodes = mergeNodes(
      store.nodes,
      (payload.nodes || []) as StudioNode[],
      (payload.deleted_node_ids || []) as string[],
      lastRemoteNodeIdsRef.current
    );
    const mergedEdges = mergeEdges(
      store.edges,
      (payload.edges || []) as Edge[],
      (payload.deleted_edge_ids || []) as string[],
      lastRemoteEdgeIdsRef.current
    );

    console.log("[Canvas Sync] State merged", {
      nodes: mergedNodes.length,
      timestamp: remoteTimestamp
    });

    isRemoteChangeRef.current = true;
    store.setNodes(mergedNodes);
    store.setEdges(mergedEdges);
    lastUpdateRef.current = remoteTimestamp;
    
    lastRemoteNodeIdsRef.current = new Set((payload.nodes || []).map((n: any) => n.id));
    lastRemoteEdgeIdsRef.current = new Set((payload.edges || []).map((e: any) => e.id));
    
    setTimeout(() => {
      isRemoteChangeRef.current = false;
    }, 100);
  }, []);

  // 1. Initial Data Fetch
  useEffect(() => {
    if (!brandProfileId) return;

    const loadInitialState = async () => {
      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("canvas_sessions" as any)
        .select("*")
        .eq("brand_profile_id", brandProfileId)
        .maybeSingle();

      if (error) {
        console.error("[Canvas Sync] Load failed", error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const session = data as unknown as CanvasSession;
        isRemoteChangeRef.current = true;
        hasLoadedInitialDataRef.current = true;
        
        const store = useStudioStore.getState();
        store.setNodes((session.nodes || []) as StudioNode[]);
        store.setEdges((session.edges || []) as Edge[]);
        lastUpdateRef.current = session.updated_at;
        
        lastRemoteNodeIdsRef.current = new Set((session.nodes || []).map((n: any) => n.id));
        lastRemoteEdgeIdsRef.current = new Set((session.edges || []).map((e: any) => e.id));

        setTimeout(() => {
          isRemoteChangeRef.current = false;
          setIsLoading(false);
        }, 100);
      } else {
        hasLoadedInitialDataRef.current = true;
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, [brandProfileId, supabase]);

  // 2. Realtime Channel (Broadcast & Presence)
  useEffect(() => {
    if (!brandProfileId) return;

    const channelTopic = `canvas:broadcast:${brandProfileId}`;
    console.log("[Canvas Sync] Creating broadcast channel:", channelTopic);
    
    const channel = supabase.channel(channelTopic, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast" as any, { event: "canvas_updated" }, ({ payload }: any) => {
        console.log("[Canvas Sync] Broadcast update received");
        handleRemoteUpdate(payload);
      })
      .on("broadcast" as any, { event: "cursor" }, ({ payload }: any) => {
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
      .on("presence" as any, { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        Object.values(state).forEach((entries: any) => {
          entries.forEach((entry: any) => users.push(entry as PresenceUser));
        });
        setOnlineUsers(users);
      })
      .on("presence" as any, { event: "leave" }, ({ leftPresences }: any) => {
        setRemoteCursors((prev) => {
          const next = { ...prev };
          leftPresences.forEach((p: any) => delete next[p.user_id]);
          return next;
        });
      })
      .subscribe((subStatus, err) => {
        console.log("[Canvas Sync] Broadcast channel status:", subStatus);
        if (err) console.error("[Canvas Sync] Broadcast error:", err);
        setStatus(subStatus as RealtimeStatus);
      });

    broadcastChannelRef.current = channel;

    return () => {
      console.log("[Canvas Sync] Tearing down broadcast channel");
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
    };
  }, [brandProfileId, supabase, handleRemoteUpdate]);

  // 3. Realtime Channel (Postgres Changes)
  useEffect(() => {
    if (!brandProfileId) return;

    const channelTopic = `canvas:db:${brandProfileId}`;
    console.log("[Canvas Sync] Creating DB channel:", channelTopic);

    const channel = supabase.channel(channelTopic, {
      config: { broadcast: { self: false } },
    });

    channel
      .on(
        "postgres_changes" as any,
        {
          event: "*", 
          schema: "brand_profiles",
          table: "canvas_sessions"
        },
        (payload: any) => {
          // Manually filter by ID to ensure binding is simple and reliable
          const record = payload.new || payload.old;
          if (record?.brand_profile_id !== brandProfileId) return;

          console.log("[Canvas Sync] Postgres Change:", payload.eventType);
          
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            handleRemoteUpdate({
              nodes: payload.new.nodes,
              edges: payload.new.edges,
              deleted_node_ids: payload.new.deleted_node_ids,
              deleted_edge_ids: payload.new.deleted_edge_ids,
              updated_at: payload.new.updated_at
            });
          } else if (payload.eventType === "DELETE") {
            // Handle full row deletion if necessary
            window.location.reload();
          }
        }
      )
      .subscribe((subStatus, err) => {
        console.log("[Canvas Sync] DB channel status:", subStatus);
        if (err) console.error("[Canvas Sync] DB Realtime error:", err);
        setDbStatus(subStatus as RealtimeStatus);
      });

    dbChannelRef.current = channel;

    return () => {
      console.log("[Canvas Sync] Tearing down DB channel");
      supabase.removeChannel(channel);
      dbChannelRef.current = null;
    };
  }, [brandProfileId, supabase, handleRemoteUpdate]);

  // 4. Presence Tracking
  useEffect(() => {
    if (status === "SUBSCRIBED" && user && broadcastChannelRef.current) {
      broadcastChannelRef.current.track({
        user_id: user.id,
        full_name: user.user_metadata?.full_name || user.email || "Anonymous",
        avatar_url: user.user_metadata?.avatar_url || "",
        email: user.email || "",
        selected_node_ids: [],
        color: stringToColor(user.id),
        online_at: new Date().toISOString(),
      });
    }
  }, [status, user]);

  // 5. Save/Broadcast state
  const saveCanvasToDatabase = useCallback(async () => {
    if (!brandProfileId || !hasLoadedInitialDataRef.current) return;

    setIsSaving(true);
    try {
      const state = useStudioStore.getState();
      const currentNodes = state.nodes;
      const currentEdges = state.edges;
      const defaultEdgeType = state.defaultEdgeType;
      const deletedNodeIds = state.getDeletedNodeIds();
      const deletedEdgeIds = state.getDeletedEdgeIds();

      const serialized = serializeWorkflowSnapshot(currentNodes, currentEdges, defaultEdgeType);

      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("canvas_sessions" as any)
        .upsert(
          {
            brand_profile_id: brandProfileId,
            nodes: serialized.nodes as any,
            edges: serialized.edges as any,
            deleted_node_ids: deletedNodeIds,
            deleted_edge_ids: deletedEdgeIds,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "brand_profile_id" }
        )
        .select("updated_at")
        .single();

      if (error) {
        console.error("[Canvas Sync] Save failed", error);
      } else if (data) {
        lastUpdateRef.current = (data as any).updated_at;
        
        lastRemoteNodeIdsRef.current = new Set(serialized.nodes.map((n: any) => n.id));
        lastRemoteEdgeIdsRef.current = new Set(serialized.edges.map((e: any) => e.id));

        if (broadcastChannelRef.current && status === "SUBSCRIBED") {
          broadcastChannelRef.current.send({
            type: "broadcast",
            event: "canvas_updated",
            payload: {
              nodes: serialized.nodes,
              edges: serialized.edges,
              deleted_node_ids: deletedNodeIds,
              deleted_edge_ids: deletedEdgeIds,
              updated_at: lastUpdateRef.current
            }
          });
        }
        
        state.clearDeletedIds(deletedNodeIds, deletedEdgeIds);
      }
    } catch (err) {
      console.error("[Canvas Sync] Save error", err);
    } finally {
      setIsSaving(false);
    }
  }, [brandProfileId, supabase, status]);

  const saveTrigger = useStudioStore((state) => state.saveTrigger);
  useEffect(() => {
    if (saveTrigger > 0) {
      saveCanvasToDatabase();
    }
  }, [saveTrigger, saveCanvasToDatabase]);

  // 6. Ephemeral Cursors
  const lastCursorSendRef = useRef<number>(0);
  const updateCursor = useCallback((x: number, y: number) => {
    if (!user || !broadcastChannelRef.current || status !== "SUBSCRIBED") return;
    const now = Date.now();
    if (now - lastCursorSendRef.current < 50) return;
    lastCursorSendRef.current = now;

    broadcastChannelRef.current.send({
      type: "broadcast",
      event: "cursor",
      payload: {
        userId: user.id,
        x, y,
        name: user.user_metadata?.full_name || user.email || "Anonymous",
        color: stringToColor(user.id),
      },
    });
  }, [user, status]);

  const updatePresence = useCallback((nodeIds: string[]) => {
    if (!user || !broadcastChannelRef.current || status !== "SUBSCRIBED") return;
    const sortedNew = [...nodeIds].sort().join(',');
    const sortedCurrent = [...selectedNodeIds].sort().join(',');
    if (sortedNew === sortedCurrent) return;

    setSelectedNodeIds(nodeIds);
    broadcastChannelRef.current.track({
      user_id: user.id,
      full_name: user.user_metadata?.full_name || user.email || "Anonymous",
      avatar_url: user.user_metadata?.avatar_url || "",
      email: user.email || "",
      selected_node_ids: nodeIds,
      color: stringToColor(user.id),
      online_at: new Date().toISOString(),
    });
  }, [user, selectedNodeIds, status]);

  return { 
    remoteCursors, 
    updateCursor, 
    updatePresence, 
    isLoading, 
    onlineUsers, 
    status,
    dbStatus,
    isSaving,
    saveCanvasToDatabase 
  };
}
