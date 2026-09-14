'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { z } from 'zod';
import { toast } from '@/components/ui/toast-imperative';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

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

export const canvasRoomsQueryKey = (brandProfileId: string) =>
  ['canvas-rooms', brandProfileId] as const;

/** Module-level so an unloaded brand's rooms keep one identity across renders. */
const NO_ROOMS: CanvasRoom[] = [];

/**
 * The brand's canvas workspaces.
 *
 * Goes through React Query because the answer is per-BRAND and this hook has two callers on
 * one screen: `StudioCanvas` mounts it for the room it should open, and the `CanvasRoomsTabs`
 * it renders mounts it again for the tab strip. Held in local state that was four identical
 * `canvas_rooms` SELECTs per canvas open — two instances, each fetching once on mount and
 * again when its realtime channel subscribed. One shared key collapses them.
 *
 * Realtime rows are written into the SAME cache entry rather than into per-instance state,
 * so both callers see one list. A row that arrives before the first read lands is dropped
 * on purpose: the read in flight already includes it, and seeding the cache early would
 * flip `isLoading` and paint a one-room list over an empty one.
 */
export function useCanvasRooms(brandProfileId: string) {
  const supabase = createSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const queryKey = canvasRoomsQueryKey(brandProfileId);

  const query = useQuery({
    queryKey,
    // No AbortSignal: an unmount mid-flight would cancel a read the other caller is waiting
    // on, and React Query would then have to redo it.
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('brand_profiles' as any)
        .from('canvas_rooms' as any)
        .select('*')
        .eq('brand_profile_id', brandProfileId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Canvas Rooms] Fetch failed', error);
        throw new Error(error.message);
      }
      return ((data as CanvasRoom[]) ?? []) as CanvasRoom[];
    },
    enabled: Boolean(brandProfileId),
    staleTime: 5 * 60_000,
  });

  // Toasted here rather than inside the queryFn: the client retries a failed read once, and
  // a toast in the queryFn would tell the user twice about one failure.
  const failed = query.isError;
  useEffect(() => {
    if (failed) toast.error('Failed to load workspaces');
  }, [failed]);

  const rooms = query.data ?? NO_ROOMS;
  // No brand means no answer is coming, which is what this hook reported before React Query
  // and what CanvasRoomsTabs renders nothing for.
  const isLoading = !brandProfileId || query.isLoading;

  // Keyed off `brandProfileId`, not the key array: `canvasRoomsQueryKey` builds a fresh array
  // every render, and a changing dep here would tear down and rebuild the realtime
  // subscription below on every single render.
  const setRooms = useCallback(
    (update: (current: CanvasRoom[]) => CanvasRoom[]) => {
      queryClient.setQueryData<CanvasRoom[]>(canvasRoomsQueryKey(brandProfileId), (current) =>
        current ? update(current) : current,
      );
    },
    [queryClient, brandProfileId],
  );

  const fetchRooms = useCallback(
    () => queryClient.invalidateQueries({ queryKey: canvasRoomsQueryKey(brandProfileId) }),
    [queryClient, brandProfileId],
  );

  useEffect(() => {
    if (!brandProfileId) return;

    const receiveRoom = (row: Record<string, unknown>) => {
      const parsed = canvasRoomSchema.safeParse(row);
      if (!parsed.success || parsed.data.brand_profile_id !== brandProfileId) return;
      setRooms((current) =>
        [...current.filter((room) => room.id !== parsed.data.id), parsed.data].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        ),
      );
    };

    const scoped = {
      schema: 'brand_profiles',
      table: 'canvas_rooms',
      filter: `brand_profile_id=eq.${brandProfileId}`,
    } as const;

    // The `useId()` this used to build into its topic is gone: the helper's UUID topic
    // is the same guarantee, made structurally rather than by remembering to do it. That
    // matters here more than most — StudioCanvas calls this hook AND renders
    // CanvasRoomsTabs, which calls it again with the same brand.
    return subscribeToPostgresChanges({
      label: `canvas-rooms:${brandProfileId}`,
      bindings: [
        { ...scoped, event: 'INSERT', onRow: receiveRoom },
        { ...scoped, event: 'UPDATE', onRow: receiveRoom },
        {
          // Deliberately unfiltered: a DELETE payload carries only the primary key, so
          // Postgres cannot evaluate a brand filter against it.
          event: 'DELETE',
          schema: 'brand_profiles',
          table: 'canvas_rooms',
          onRow: (row) => {
            const deleted = z.object({ id: z.string().uuid() }).safeParse(row);
            if (deleted.success) {
              setRooms((current) => current.filter((room) => room.id !== deleted.data.id));
            }
          },
        },
      ],
      onSubscribed: () => {
        void fetchRooms();
      },
    });
  }, [brandProfileId, fetchRooms, setRooms]);

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
