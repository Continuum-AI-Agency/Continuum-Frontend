"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useStudioStore } from "@/StudioCanvas/stores/useStudioStore";
import { useSession } from "@/hooks/useSession";
import type { StudioNode } from "@/StudioCanvas/types";
import type { Edge } from "@xyflow/react";

export function useCanvasRealtime(brandProfileId: string) {
  const supabase = createSupabaseBrowserClient();
  const { user } = useSession();
  const { nodes, edges, setNodes, setEdges } = useStudioStore();
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, { x: number; y: number; name: string; color: string }>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  const lastUpdateRef = useRef<string | null>(null);
  const isRemoteChangeRef = useRef<boolean>(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);

  useEffect(() => {
    if (!brandProfileId) return;

    const loadInitialState = async () => {
      const { data, error } = await (supabase
        .from("canvas_sessions" as any) as any)
        .select("*")
        .eq("brand_profile_id", brandProfileId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error loading canvas session:", error);
        setIsLoading(false);
        return;
      }

      if (data) {
        isRemoteChangeRef.current = true;
        setNodes(data.nodes as StudioNode[]);
        setEdges(data.edges as Edge[]);
        lastUpdateRef.current = data.updated_at;
        setTimeout(() => {
          isRemoteChangeRef.current = false;
          isInitialLoadRef.current = false;
          setIsLoading(false);
        }, 100);
      } else {
        isInitialLoadRef.current = false;
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, [brandProfileId, supabase, setNodes, setEdges]);

  useEffect(() => {
    if (!brandProfileId) return;

    const channel = supabase
      .channel(`canvas_session:${brandProfileId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "brand_profiles",
          table: "canvas_sessions",
          filter: `brand_profile_id=eq.${brandProfileId}`,
        },
        (payload: any) => {
          if (payload.new.updated_at === lastUpdateRef.current) return;

          isRemoteChangeRef.current = true;
          setNodes(payload.new.nodes as StudioNode[]);
          setEdges(payload.new.edges as Edge[]);
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
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [brandProfileId, supabase, user?.id, setNodes, setEdges]);

  useEffect(() => {
    if (isRemoteChangeRef.current || isInitialLoadRef.current || !brandProfileId) return;

    const timer = setTimeout(async () => {
      const { data, error } = await (supabase
        .from("canvas_sessions" as any) as any)
        .upsert(
          {
            brand_profile_id: brandProfileId,
            nodes: nodes as any,
            edges: edges as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "brand_profile_id" }
        )
        .select("updated_at")
        .single();

      if (!error && data) {
        lastUpdateRef.current = data.updated_at;
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [nodes, edges, brandProfileId, supabase]);

  const updateCursor = useCallback(
    (x: number, y: number) => {
      if (!user || !channelRef.current) return;
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

  return { remoteCursors, updateCursor, isLoading };
}

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = "#";
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += ("00" + value.toString(16)).slice(-2);
  }
  return color;
}
