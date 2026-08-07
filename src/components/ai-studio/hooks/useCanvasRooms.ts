'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const canvasRoomSchema = z
  .object({
    id: z.string().uuid(),
    brand_profile_id: z.string().min(1),
    name: z.string(),
    created_at: z.string(),
    created_by: z.string().nullable(),
    kind: z.enum(['general', 'planner']),
  })
  .strict();

export type CanvasRoom = z.infer<typeof canvasRoomSchema>;

const createdWorkspaceSchema = z.object({
  room_id: z.string().uuid(),
  name: z.string(),
  kind: z.literal('general'),
  created_at: z.string(),
});

type WorkspaceRpcError = { message: string; code?: string };
type WorkspaceRpcClient = {
  rpc(
    name: 'create_canvas_workspace',
    args: { p_brand_profile_id: string; p_name: string },
  ): Promise<{ data: unknown; error: WorkspaceRpcError | null }>;
};

export function useCanvasRooms(brandProfileId: string) {
  const supabase = createSupabaseBrowserClient();
  const channelId = useId();
  const [rooms, setRooms] = useState<CanvasRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    if (!brandProfileId) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .schema('brand_profiles' as any)
      .from('canvas_rooms' as any)
      .select('*')
      .eq('brand_profile_id', brandProfileId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Canvas Rooms] Fetch failed', error);
      toast.error('Failed to load workspaces');
    } else {
      setRooms((data as CanvasRoom[]) || []);
    }
    setIsLoading(false);
  }, [brandProfileId, supabase]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    if (!brandProfileId) return;

    const receiveRoom = (payload: { new: unknown }) => {
      const parsed = canvasRoomSchema.safeParse(payload.new);
      if (!parsed.success || parsed.data.brand_profile_id !== brandProfileId) return;
      setRooms((current) =>
        [...current.filter((room) => room.id !== parsed.data.id), parsed.data].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        ),
      );
    };

    const channel = supabase
      .channel(`canvas-rooms:${brandProfileId}:${channelId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'brand_profiles',
          table: 'canvas_rooms',
          filter: `brand_profile_id=eq.${brandProfileId}`,
        },
        receiveRoom,
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'brand_profiles',
          table: 'canvas_rooms',
          filter: `brand_profile_id=eq.${brandProfileId}`,
        },
        receiveRoom,
      )
      .on(
        'postgres_changes' as any,
        { event: 'DELETE', schema: 'brand_profiles', table: 'canvas_rooms' },
        (payload: { old: unknown }) => {
          const deleted = z.object({ id: z.string().uuid() }).safeParse(payload.old);
          if (deleted.success) {
            setRooms((current) => current.filter((room) => room.id !== deleted.data.id));
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void fetchRooms();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandProfileId, channelId, fetchRooms, supabase]);

  const createRoom = async (name: string) => {
    const generalRooms = rooms.filter((room) => room.kind !== 'planner');
    if (generalRooms.length >= 3) {
      toast.error('Maximum 3 workspaces allowed');
      return null;
    }

    const workspaceClient = supabase.schema(
      'brand_profiles' as never,
    ) as unknown as WorkspaceRpcClient;
    const { data, error } = await workspaceClient.rpc('create_canvas_workspace', {
      p_brand_profile_id: brandProfileId,
      p_name: name,
    });

    if (error) {
      console.error('[Canvas Rooms] Create failed', error);
      toast.error('Failed to create workspace');
      return null;
    }

    const parsed = createdWorkspaceSchema.safeParse(data);
    if (!parsed.success) {
      console.error('[Canvas Rooms] Create returned an invalid workspace', parsed.error.flatten());
      toast.error('Failed to create workspace');
      return null;
    }
    const room: CanvasRoom = {
      id: parsed.data.room_id,
      brand_profile_id: brandProfileId,
      name: parsed.data.name,
      created_at: parsed.data.created_at,
      created_by: null,
      kind: parsed.data.kind,
    };
    setRooms((prev) => [...prev, room]);
    toast.success('Workspace created');
    return room;
  };

  const deleteRoom = async (roomId: string) => {
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (room?.kind === 'planner') {
      toast.error('Planner Compositions is a reserved workspace');
      return false;
    }
    if (rooms.filter((candidate) => candidate.kind !== 'planner').length <= 1) {
      toast.error('Cannot delete the last workspace');
      return false;
    }

    const { error } = await supabase
      .schema('brand_profiles' as any)
      .from('canvas_rooms' as any)
      .delete()
      .eq('id', roomId);

    if (error) {
      console.error('[Canvas Rooms] Delete failed', error);
      toast.error('Failed to delete workspace');
      return false;
    }

    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    toast.success('Workspace deleted');
    return true;
  };

  const updateRoomName = async (roomId: string, name: string) => {
    if (rooms.find((room) => room.id === roomId)?.kind === 'planner') {
      toast.error('Planner Compositions is a reserved workspace');
      return false;
    }
    const { error } = await supabase
      .schema('brand_profiles' as any)
      .from('canvas_rooms' as any)
      .update({ name })
      .eq('id', roomId);

    if (error) {
      console.error('[Canvas Rooms] Update failed', error);
      toast.error('Failed to update workspace name');
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
