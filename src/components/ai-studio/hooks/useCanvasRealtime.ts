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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const lastUpdateRef = useRef<string | null>(null);
  const isRemoteChangeRef = useRef<boolean>(false);
  const channelRef = useRef<any>(null);
  const hasLoadedInitialDataRef = useRef<boolean>(false);
  const lastRemoteNodeIdsRef = useRef<Set<string>>(new Set());
  const lastRemoteEdgeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!brandProfileId) return;

    const loadInitialState = async () => {
      console.log("[Canvas Sync] Loading initial state for:", brandProfileId);
      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("canvas_sessions" as any)
        .select("*")
        .eq("brand_profile_id", brandProfileId)
        .maybeSingle();

      if (error) {
        console.error("[Canvas Sync] Error loading initial state:", error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const session = data as unknown as CanvasSession;
        console.log("[Canvas Sync] Initial state loaded:", { nodeCount: session.nodes?.length });
        
        isRemoteChangeRef.current = true;
        hasLoadedInitialDataRef.current = true;
        
        const store = useStudioStore.getState();
        store.setNodes((session.nodes || []) as StudioNode[]);
        store.setEdges((session.edges || []) as Edge[]);
        lastUpdateRef.current = session.updated_at;
        
        lastRemoteNodeIdsRef.current = new Set(session.nodes?.map((n: any) => n.id) || []);
        lastRemoteEdgeIdsRef.current = new Set(session.edges?.map((e: any) => e.id) || []);

        setTimeout(() => {
          isRemoteChangeRef.current = false;
          setIsLoading(false);
        }, 100);
      } else {
        console.log("[Canvas Sync] No existing session found");
        lastRemoteNodeIdsRef.current = new Set();
        lastRemoteEdgeIdsRef.current = new Set();
        hasLoadedInitialDataRef.current = true;
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, [brandProfileId, supabase]);

  const handleRemoteUpdate = useCallback((payload: { 
    nodes: any[], 
    edges: any[], 
    deleted_node_ids?: string[], 
    deleted_edge_ids?: string[], 
    updated_at: string 
  }) => {
    const remoteTimestamp = payload.updated_at;
    const localTimestamp = lastUpdateRef.current;

    console.log("[Canvas Sync] Update event received", {
      remoteTs: remoteTimestamp,
      localTs: localTimestamp,
      match: remoteTimestamp === localTimestamp
    });

    if (remoteTimestamp && localTimestamp && remoteTimestamp === localTimestamp) {
      console.log("[Canvas Sync] Skipping redundant update");
      return;
    }

    const isRemoteNewer = !localTimestamp || new Date(remoteTimestamp) >= new Date(localTimestamp);
    if (!isRemoteNewer) {
      console.log("[Canvas Sync] Skipping older update");
      return;
    }

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

    console.log("[Canvas Sync] Applying merge result", {
      remoteNodes: payload.nodes?.length,
      mergedNodes: mergedNodes.length,
      prevRemoteNodes: lastRemoteNodeIdsRef.current.size
    });

    isRemoteChangeRef.current = true;
    store.setNodes(mergedNodes);
    store.setEdges(mergedEdges);
    lastUpdateRef.current = remoteTimestamp;
    
    lastRemoteNodeIdsRef.current = new Set(payload.nodes?.map((n: any) => n.id) || []);
    lastRemoteEdgeIdsRef.current = new Set(payload.edges?.map((e: any) => e.id) || []);
    
    setTimeout(() => {
      isRemoteChangeRef.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    if (!brandProfileId) return;

    console.log("[Canvas Sync] Setting up channel for:", brandProfileId);
    
    const channel = supabase.channel(`canvas_session:${brandProfileId}`, {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "brand_profiles",
          table: "canvas_sessions",
          filter: `brand_profile_id=eq.${brandProfileId}`,
        },
        (payload: any) => {
          console.log("[Canvas Sync] DB Update Event Received", payload);
          handleRemoteUpdate({
            nodes: payload.new.nodes,
            edges: payload.new.edges,
            deleted_node_ids: payload.new.deleted_node_ids,
            deleted_edge_ids: payload.new.deleted_edge_ids,
            updated_at: payload.new.updated_at
          });
        }
      )
      .on("broadcast" as any, { event: "canvas_updated" }, ({ payload }: any) => {
        console.log("[Canvas Sync] Broadcast Event Received", payload);
        handleRemoteUpdate(payload);
      })
      .on("broadcast" as any, { event: "cursor" }, ({ payload }: any) => {
        if (payload.userId === user?.id) return;
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
      .subscribe(async (subStatus) => {
        console.log("[Canvas Sync] Subscription Status:", subStatus);
        setStatus(subStatus as RealtimeStatus);
        if (subStatus === "SUBSCRIBED" && user) {
          console.log("[Canvas Sync] Joining presence stack");
          await channel.track({
            user_id: user.id,
            full_name: user.user_metadata?.full_name || user.email || "Anonymous",
            avatar_url: user.user_metadata?.avatar_url || "",
            email: user.email || "",
            selected_node_ids: [],
            color: stringToColor(user.id),
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      console.log("[Canvas Sync] Tearing down channel");
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [brandProfileId, supabase, user, handleRemoteUpdate]);

  const saveCanvasToDatabase = useCallback(async () => {
    if (!brandProfileId || !hasLoadedInitialDataRef.current) {
      console.log("[Canvas Sync] Save skipped: not ready");
      return;
    }

    try {
      const state = useStudioStore.getState();
      const currentNodes = state.nodes;
      const currentEdges = state.edges;
      const defaultEdgeType = state.defaultEdgeType;
      const deletedNodeIds = state.getDeletedNodeIds();
      const deletedEdgeIds = state.getDeletedEdgeIds();

      const serialized = serializeWorkflowSnapshot(currentNodes, currentEdges, defaultEdgeType);

      console.log("[Canvas Sync] Executing Save...");

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
        console.error("[Canvas Sync] Save failed:", error);
      } else if (data) {
        lastUpdateRef.current = (data as any).updated_at;
        console.log("[Canvas Sync] Save successful, broadcasting update", lastUpdateRef.current);
        
        lastRemoteNodeIdsRef.current = new Set(serialized.nodes.map((n: any) => n.id));
        lastRemoteEdgeIdsRef.current = new Set(serialized.edges.map((e: any) => e.id));

        if (channelRef.current && status === "SUBSCRIBED") {
          channelRef.current.send({
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
      console.error("[Canvas Sync] Save exception:", err);
    }
  }, [brandProfileId, supabase, status]);

  const saveTrigger = useStudioStore((state) => state.saveTrigger);
  useEffect(() => {
    if (saveTrigger > 0) {
      saveCanvasToDatabase();
    }
  }, [saveTrigger, saveCanvasToDatabase]);

  const lastCursorSendRef = useRef<number>(0);
  const updateCursor = useCallback((x: number, y: number) => {
    if (!user || !channelRef.current || status !== "SUBSCRIBED") return;
    const now = Date.now();
    if (now - lastCursorSendRef.current < 50) return;
    lastCursorSendRef.current = now;

    channelRef.current.send({
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
    if (!user || !channelRef.current || status !== "SUBSCRIBED") return;
    const sortedNew = [...nodeIds].sort().join(',');
    const sortedCurrent = [...selectedNodeIds].sort().join(',');
    if (sortedNew === sortedCurrent) return;

    setSelectedNodeIds(nodeIds);
    channelRef.current.track({
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
    saveCanvasToDatabase 
  };
}
