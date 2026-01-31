import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useStudioStore } from "@/StudioCanvas/stores/useStudioStore";
import { useSession } from "@/hooks/useSession";
import type { StudioNode } from "@/StudioCanvas/types";
import type { Edge } from "@xyflow/react";
import { stringToColor } from "@/lib/utils/color";
import { mergeNodes, mergeEdges } from "./merge-strategy";

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
  const { nodes, edges, setNodes, setEdges } = useStudioStore();
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
  const isInitialLoadRef = useRef<boolean>(true);
  const hasLoadedInitialDataRef = useRef<boolean>(false);

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
        console.error("Error loading canvas session:", error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const session = data as unknown as CanvasSession;
        isRemoteChangeRef.current = true;
        hasLoadedInitialDataRef.current = true;
        setNodes((session.nodes || []) as StudioNode[]);
        setEdges((session.edges || []) as Edge[]);
        lastUpdateRef.current = session.updated_at;
        setTimeout(() => {
          isRemoteChangeRef.current = false;
          isInitialLoadRef.current = false;
          setIsLoading(false);
        }, 100);
      } else {
        hasLoadedInitialDataRef.current = true;
        isInitialLoadRef.current = false;
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, [brandProfileId, supabase, setNodes, setEdges]);

  useEffect(() => {
    if (!brandProfileId) return;

    const channel = supabase.channel(`canvas_session:${brandProfileId}`, {
      config: {
        broadcast: {
          self: false,
        },
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
          console.log("[Canvas Sync] Remote update received:", {
            nodeCount: (payload.new.nodes || []).length,
            edgeCount: (payload.new.edges || []).length,
          });

          if (payload.new.updated_at === lastUpdateRef.current) {
            return;
          }

          const mergedNodes = mergeNodes(
            nodes,
            (payload.new.nodes || []) as StudioNode[],
            (payload.new.deleted_node_ids || []) as string[]
          );
          const mergedEdges = mergeEdges(
            edges,
            (payload.new.edges || []) as Edge[],
            (payload.new.deleted_edge_ids || []) as string[]
          );

          isRemoteChangeRef.current = true;
          setNodes(mergedNodes);
          setEdges(mergedEdges);
          lastUpdateRef.current = payload.new.updated_at;
          setTimeout(() => {
            isRemoteChangeRef.current = false;
          }, 100);
        }
      )
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
        
        Object.values(state).forEach((presenceEntries: any[]) => {
          presenceEntries.forEach((entry: any) => {
            users.push(entry as PresenceUser);
          });
        });
        
        setOnlineUsers(users);
      })
      .on("presence" as any, { event: "leave" }, ({ leftPresences }: any) => {
        setRemoteCursors((prev) => {
          const next = { ...prev };
          leftPresences.forEach((presence: any) => {
            delete next[presence.user_id];
          });
          return next;
        });
      })
      .subscribe(async (subStatus) => {
        setStatus(subStatus as RealtimeStatus);
        if (subStatus === "SUBSCRIBED" && user) {
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
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [brandProfileId, supabase, user, setNodes, setEdges]);

  const lastCursorSendRef = useRef<number>(0);
  const updateCursor = useCallback(
    (x: number, y: number) => {
      if (!user || !channelRef.current || status !== "SUBSCRIBED") return;
      
      const now = Date.now();
      if (now - lastCursorSendRef.current < 50) return;
      lastCursorSendRef.current = now;

      channelRef.current.send({
        type: "broadcast",
        event: "cursor",
        payload: {
          userId: user.id,
          x,
          y,
          name: user.user_metadata?.full_name || user.email || "Anonymous",
          color: stringToColor(user.id),
        },
      });
    },
    [user]
  );

  const updatePresence = useCallback(
    (nodeIds: string[]) => {
      if (!user || !channelRef.current) return;
      
      // Only track if selection actually changed
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
    },
    [user, selectedNodeIds]
  );

  const saveCanvasToDatabase = useCallback(async () => {
    if (!brandProfileId || !hasLoadedInitialDataRef.current) {
      return;
    }

    try {
      const deletedNodeIds = useStudioStore.getState().getDeletedNodeIds();
      const deletedEdgeIds = useStudioStore.getState().getDeletedEdgeIds();

      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("canvas_sessions" as any)
        .upsert(
          {
            brand_profile_id: brandProfileId,
            nodes: nodes as any,
            edges: edges as any,
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
        console.log("[Canvas Sync] Saved:", { nodes: nodes.length, edges: edges.length });
        useStudioStore.getState().clearDeletedIds();
      }
    } catch (err) {
      console.error("[Canvas Sync] Save error:", err);
    }
  }, [brandProfileId, supabase, nodes, edges]);

  return { remoteCursors, updateCursor, updatePresence, isLoading, onlineUsers, status, saveCanvasToDatabase };
}
