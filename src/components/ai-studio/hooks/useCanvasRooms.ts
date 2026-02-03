"use client";

import { useEffect, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export type CanvasRoom = {
  id: string;
  brand_profile_id: string;
  name: string;
  created_at: string;
  created_by: string | null;
};

export function useCanvasRooms(brandProfileId: string) {
  const supabase = createSupabaseBrowserClient();
  const [rooms, setRooms] = useState<CanvasRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    if (!brandProfileId) return;
    setIsLoading(true);
    
    const { data, error } = await supabase
      .schema("brand_profiles" as any)
      .from("canvas_rooms" as any)
      .select("*")
      .eq("brand_profile_id", brandProfileId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Canvas Rooms] Fetch failed", error);
      toast.error("Failed to load workspaces");
    } else {
      setRooms((data as CanvasRoom[]) || []);
    }
    setIsLoading(false);
  }, [brandProfileId, supabase]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const createRoom = async (name: string) => {
    if (rooms.length >= 3) {
      toast.error("Maximum 3 workspaces allowed");
      return null;
    }

    const { data, error } = await supabase
      .schema("brand_profiles" as any)
      .from("canvas_rooms" as any)
      .insert({
        brand_profile_id: brandProfileId,
        name,
      })
      .select()
      .single();

    if (error) {
      console.error("[Canvas Rooms] Create failed", error);
      toast.error("Failed to create workspace");
      return null;
    }

    setRooms((prev) => [...prev, data as CanvasRoom]);
    toast.success("Workspace created");
    return data as CanvasRoom;
  };

  const deleteRoom = async (roomId: string) => {
    if (rooms.length <= 1) {
      toast.error("Cannot delete the last workspace");
      return false;
    }

    const { error } = await supabase
      .schema("brand_profiles" as any)
      .from("canvas_rooms" as any)
      .delete()
      .eq("id", roomId);

    if (error) {
      console.error("[Canvas Rooms] Delete failed", error);
      toast.error("Failed to delete workspace");
      return false;
    }

    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    toast.success("Workspace deleted");
    return true;
  };

  const updateRoomName = async (roomId: string, name: string) => {
    const { error } = await supabase
      .schema("brand_profiles" as any)
      .from("canvas_rooms" as any)
      .update({ name })
      .eq("id", roomId);

    if (error) {
      console.error("[Canvas Rooms] Update failed", error);
      toast.error("Failed to update workspace name");
      return false;
    }

    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, name } : r)));
    return true;
  };

  return {
    rooms,
    isLoading,
    createRoom,
    deleteRoom,
    updateRoomName,
    refreshRooms: fetchRooms,
  };
}
