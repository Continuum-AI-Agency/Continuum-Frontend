"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  room_id: string;
  nodes: any[];
  edges: any[];
  deleted_node_ids?: string[];
  deleted_edge_ids?: string[];
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

type CanvasUpdatePayload = {
  nodes: any[];
  edges: any[];
  deleted_node_ids?: string[];
  deleted_edge_ids?: string[];
  updated_at: string;
};

const normalizeRealtimeStatus = (value: string): RealtimeStatus =>
  value === "CHANNEL_ERROR" ? "ERROR" : (value as RealtimeStatus);

export function useCanvasRealtime(brandProfileId: string, roomId?: string) {
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
  const pendingSaveRef = useRef<boolean>(false);
  const saveInFlightRef = useRef<boolean>(false);
  const pendingBroadcastPayloadRef = useRef<CanvasUpdatePayload | null>(null);

  const handleRemoteUpdate = useCallback((payload: CanvasUpdatePayload) => {
    const remoteTimestamp = payload.updated_at;
    const localTimestamp = lastUpdateRef.current;

    if (remoteTimestamp && localTimestamp && remoteTimestamp === localTimestamp) {
      return;
    }

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

  const syncLatestCanvasSession = useCallback(async () => {
    if (!brandProfileId || !roomId) return;

    const { data, error } = await supabase
      .schema("brand_profiles" as any)
      .from("canvas_sessions" as any)
      .select("*")
      .eq("brand_profile_id", brandProfileId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (error) {
      console.error("[Canvas Sync] Catch-up load failed", error);
      return;
    }

    if (!data) return;
    const session = data as unknown as CanvasSession;
    handleRemoteUpdate({
      nodes: session.nodes || [],
      edges: session.edges || [],
      deleted_node_ids: session.deleted_node_ids || [],
      deleted_edge_ids: session.deleted_edge_ids || [],
      updated_at: session.updated_at,
    });
  }, [brandProfileId, roomId, supabase, handleRemoteUpdate]);

  useEffect(() => {
    if (!brandProfileId || !roomId) {
      pendingBroadcastPayloadRef.current = null;
      pendingSaveRef.current = false;
      if (!roomId) setIsLoading(false);
      return;
    }

    const loadInitialState = async () => {
      setIsLoading(true);
      hasLoadedInitialDataRef.current = false;
      
      const { data, error } = await supabase
        .schema("brand_profiles" as any)
        .from("canvas_sessions" as any)
        .select("*")
        .eq("brand_profile_id", brandProfileId)
        .eq("room_id", roomId)
        .maybeSingle();

      if (error) {
        console.error("[Canvas Sync] Load failed", error);
        hasLoadedInitialDataRef.current = true;
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
        const store = useStudioStore.getState();
        store.setNodes([]);
        store.setEdges([]);
      }
    };

    loadInitialState();
  }, [brandProfileId, roomId, supabase]);

  useEffect(() => {
    if (!brandProfileId || !roomId) return;

    const channelTopic = `canvas:broadcast:${brandProfileId}:${roomId}`;
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
        setStatus(normalizeRealtimeStatus(subStatus));
      });

    broadcastChannelRef.current = channel;

    return () => {
      console.log("[Canvas Sync] Tearing down broadcast channel");
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
      pendingBroadcastPayloadRef.current = null;
    };
  }, [brandProfileId, roomId, supabase, handleRemoteUpdate]);

  useEffect(() => {
    if (!brandProfileId || !roomId) return;

    const channelTopic = `canvas:db:${brandProfileId}:${roomId}`;
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
          table: "canvas_sessions",
          filter: `room_id=eq.${roomId}`
        },
        (payload: any) => {
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
            window.location.reload();
          }
        }
      )
      .subscribe((subStatus, err) => {
        console.log("[Canvas Sync] DB channel status:", subStatus);
        if (err) console.error("[Canvas Sync] DB Realtime error:", err);
        const normalizedStatus = normalizeRealtimeStatus(subStatus);
        setDbStatus(normalizedStatus);
        if (subStatus === "SUBSCRIBED") {
          void syncLatestCanvasSession();
        }
      });

    dbChannelRef.current = channel;

    return () => {
      console.log("[Canvas Sync] Tearing down DB channel");
      supabase.removeChannel(channel);
      dbChannelRef.current = null;
    };
  }, [brandProfileId, roomId, supabase, handleRemoteUpdate, syncLatestCanvasSession]);

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

  const saveCanvasToDatabase = useCallback(async () => {
    if (!brandProfileId || !roomId) return;
    if (!hasLoadedInitialDataRef.current || saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
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
        .schema("brand_profiles" as any)
        .from("canvas_sessions" as any)
        .upsert(
          {
            brand_profile_id: brandProfileId,
            room_id: roomId,
            nodes: serialized.nodes as any,
            edges: serialized.edges as any,
            deleted_node_ids: deletedNodeIds,
            deleted_edge_ids: deletedEdgeIds,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "brand_profile_id,room_id" }
        )
        .select("updated_at")
        .single();

      if (error) {
        console.error("[Canvas Sync] Save failed", error);
      } else if (data) {
        lastUpdateRef.current = (data as any).updated_at;

        const syncPayload: CanvasUpdatePayload = {
          nodes: currentNodes as any[],
          edges: currentEdges as any[],
          deleted_node_ids: deletedNodeIds,
          deleted_edge_ids: deletedEdgeIds,
          updated_at: lastUpdateRef.current as string,
        };

        lastRemoteNodeIdsRef.current = new Set(serialized.nodes.map((n: any) => n.id));
        lastRemoteEdgeIdsRef.current = new Set(serialized.edges.map((e: any) => e.id));

        if (broadcastChannelRef.current && status === "SUBSCRIBED") {
          broadcastChannelRef.current.send({
            type: "broadcast",
            event: "canvas_updated",
            payload: syncPayload
          });
        } else {
          pendingBroadcastPayloadRef.current = syncPayload;
        }

        state.clearDeletedIds(deletedNodeIds, deletedEdgeIds);
      }
    } catch (err) {
      console.error("[Canvas Sync] Save error", err);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void saveCanvasToDatabase();
      }
    }
  }, [brandProfileId, roomId, supabase, status]);

  const saveTrigger = useStudioStore((state) => state.saveTrigger);
  useEffect(() => {
    if (saveTrigger > 0) {
      void saveCanvasToDatabase();
    }
  }, [saveTrigger, saveCanvasToDatabase]);

  useEffect(() => {
    if (!isLoading && hasLoadedInitialDataRef.current && pendingSaveRef.current && !saveInFlightRef.current) {
      pendingSaveRef.current = false;
      void saveCanvasToDatabase();
    }
  }, [isLoading, saveCanvasToDatabase]);

  useEffect(() => {
    if (status !== "SUBSCRIBED" || !broadcastChannelRef.current || !pendingBroadcastPayloadRef.current) {
      return;
    }

    broadcastChannelRef.current.send({
      type: "broadcast",
      event: "canvas_updated",
      payload: pendingBroadcastPayloadRef.current,
    });
    pendingBroadcastPayloadRef.current = null;
  }, [status]);

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
