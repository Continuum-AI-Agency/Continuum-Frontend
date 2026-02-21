"use client";

import React, { useState } from "react";
import { PlusIcon, TrashIcon, Pencil2Icon, CheckIcon } from "@radix-ui/react-icons";
import { useCanvasRooms, CanvasRoom } from "./hooks/useCanvasRooms";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const { rooms, isLoading, createRoom, deleteRoom, updateRoomName } = useCanvasRooms(brandProfileId);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    const name = `Workspace ${rooms.length + 1}`;
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
      const remaining = rooms.filter(r => r.id !== roomId);
      if (remaining.length > 0) {
        onRoomChange(remaining[0].id);
      }
    }
  };

  if (isLoading) return null;

  return (
    <div className="flex h-10 items-center gap-1.5 rounded-lg border border-violet-400/15 bg-violet-500/5 px-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
      {rooms.map((room) => {
        const isActive = room.id === activeRoomId;
        const isEditing = room.id === editingRoomId;

        return (
          <div
            key={room.id}
            className={cn(
              "group relative flex items-center h-7 px-3 rounded-md transition-all cursor-pointer select-none border text-xs font-medium",
              isActive 
                ? "border-violet-400/35 bg-violet-500/14 text-violet-700 shadow-[0_1px_2px_rgba(76,29,149,0.12)] dark:text-violet-200"
                : "border-transparent bg-background/50 text-muted-foreground hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-200"
            )}
            onClick={() => !isEditing && onRoomChange(room.id)}
          >
            {isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  className="w-20 border-none bg-transparent p-0 text-foreground outline-none placeholder:text-violet-500/60"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditingRoomId(null);
                  }}
                />
                <CheckIcon className="h-3.5 w-3.5 cursor-pointer hover:scale-110" onClick={saveEdit} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">{room.name}</span>
                {isActive && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 ml-1">
                    <Pencil2Icon 
                      className="h-3.5 w-3.5 text-violet-700/75 hover:scale-110 hover:text-violet-700 dark:text-violet-200/80 dark:hover:text-violet-100" 
                      onClick={(e) => { e.stopPropagation(); startEditing(room); }} 
                    />
                    {rooms.length > 1 && (
                      <TrashIcon 
                        className="h-3.5 w-3.5 text-violet-700/75 hover:scale-110 hover:text-red-500 dark:text-violet-200/80 dark:hover:text-red-300" 
                        onClick={(e) => { e.stopPropagation(); handleDelete(room.id); }} 
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {rooms.length < 3 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleCreate}
                className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-background/50 text-muted-foreground transition-all hover:border-violet-400/25 hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-200"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" className="border-none bg-violet-900 text-[10px] text-white">
              New Workspace
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
