'use client';

import { CheckIcon, Pencil2Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type CanvasRoom, useCanvasRooms } from './hooks/useCanvasRooms';

interface CanvasRoomsTabsProps {
  brandProfileId: string;
  activeRoomId?: string;
  onRoomChange: (roomId: string) => void;
}

export function CanvasRoomsTabs({
  brandProfileId,
  activeRoomId,
  onRoomChange,
}: CanvasRoomsTabsProps) {
  const { rooms, isLoading, createRoom, deleteRoom, updateRoomName } =
    useCanvasRooms(brandProfileId);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const generalRooms = rooms.filter((room) => room.kind !== 'planner');

  const handleCreate = async () => {
    const name = `Workspace ${generalRooms.length + 1}`;
    const newRoom = await createRoom(name);
    if (newRoom) {
      onRoomChange(newRoom.id);
    }
  };

  const startEditing = (room: CanvasRoom) => {
    setEditingRoomId(room.id);
    setEditName(room.name);
  };

  const saveEdit = async () => {
    if (editingRoomId && editName.trim()) {
      await updateRoomName(editingRoomId, editName.trim());
    }
    setEditingRoomId(null);
  };

  const handleDelete = async (roomId: string) => {
    const success = await deleteRoom(roomId);
    if (success && activeRoomId === roomId) {
      const remaining = rooms.filter((r) => r.id !== roomId);
      if (remaining.length > 0) {
        onRoomChange(remaining[0].id);
      }
    }
  };

  if (isLoading) return null;

  return (
    // min-w-0 + its own scroller: the tabs are the widest thing in the canvas header, and
    // without this they painted outside the group holding them, straight over the
    // planner controls on the other side of the row (Airtable #224).
    <div
      className="flex h-10 min-w-0 shrink items-center gap-1.5 overflow-x-auto rounded-lg border border-border bg-muted/40 px-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
      data-testid="canvas-rooms-tabs"
    >
      {rooms.map((room) => {
        const isActive = room.id === activeRoomId;
        const isEditing = room.id === editingRoomId;

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: canvas workspace tab wrapper holds nested interactive controls (rename input + icon buttons), so it cannot be a native button; keyboard users operate those nested controls directly.
          // biome-ignore lint/a11y/useKeyWithClickEvents: the tab is a pointer affordance whose actions are reachable through the nested controls above.
          <div
            key={room.id}
            className={cn(
              'group relative flex items-center h-7 px-3 rounded-md transition-all cursor-pointer select-none border text-xs font-medium',
              isActive
                ? 'border-primary/35 bg-primary/10 text-primary shadow-sm'
                : 'border-transparent bg-background/50 text-muted-foreground hover:bg-primary/10 hover:text-primary',
            )}
            onClick={() => !isEditing && onRoomChange(room.id)}
          >
            {isEditing ? (
              // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only calls stopPropagation so clicks in the rename field don't re-select the tab; it is not itself an interactive target.
              // biome-ignore lint/a11y/useKeyWithClickEvents: the handler merely stops propagation and performs no user action, so no keyboard equivalent applies.
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  // biome-ignore lint/a11y/noAutofocus: entering rename mode should move focus straight into the field so the user can start typing immediately.
                  autoFocus
                  className="w-20 border-none bg-transparent p-0 text-foreground outline-none placeholder:text-muted-foreground"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') setEditingRoomId(null);
                  }}
                />
                <CheckIcon
                  className="h-3.5 w-3.5 cursor-pointer hover:scale-110"
                  onClick={saveEdit}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">{room.name}</span>
                {room.kind === 'planner' ? (
                  <span className="rounded border border-border/70 px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                    Planner
                  </span>
                ) : null}
                {isActive && room.kind !== 'planner' && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 ml-1">
                    <Pencil2Icon
                      className="h-3.5 w-3.5 text-muted-foreground hover:scale-110 hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(room);
                      }}
                    />
                    {generalRooms.length > 1 && (
                      <TrashIcon
                        className="h-3.5 w-3.5 text-muted-foreground hover:scale-110 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(room.id);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {generalRooms.length < 3 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={handleCreate}
                  className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-background/50 text-muted-foreground transition-all hover:border-primary/25 hover:bg-primary/10 hover:text-primary"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              }
            />
            <TooltipContent
              side="bottom"
              align="center"
              className="bg-popover text-2xs text-popover-foreground"
            >
              New Workspace
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
