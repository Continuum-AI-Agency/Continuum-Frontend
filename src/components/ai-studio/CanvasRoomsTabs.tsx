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
    <div className="flex items-center gap-1.5 h-10 px-2 bg-indigo-500/5 rounded-lg border border-indigo-500/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
      {rooms.map((room) => {
        const isActive = room.id === activeRoomId;
        const isEditing = room.id === editingRoomId;

        return (
          <div
            key={room.id}
            className={cn(
              "group relative flex items-center h-7 px-3 rounded-md transition-all cursor-pointer select-none border text-xs font-medium",
              isActive 
                ? "bg-indigo-600 text-white border-indigo-700 shadow-sm" 
                : "bg-background/50 text-muted-foreground border-transparent hover:bg-indigo-500/10 hover:text-indigo-600"
            )}
            onClick={() => !isEditing && onRoomChange(room.id)}
          >
            {isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  className="bg-transparent border-none outline-none w-20 p-0 text-white placeholder:text-indigo-200"
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
                      className="h-3.5 w-3.5 hover:scale-110 text-white/80 hover:text-white" 
                      onClick={(e) => { e.stopPropagation(); startEditing(room); }} 
                    />
                    {rooms.length > 1 && (
                      <TrashIcon 
                        className="h-3.5 w-3.5 hover:text-red-200 hover:scale-110 text-white/80" 
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
                className="flex items-center justify-center h-7 w-7 rounded-md bg-background/50 border border-transparent hover:border-indigo-500/20 hover:bg-indigo-500/10 text-muted-foreground hover:text-indigo-600 transition-all ml-0.5"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" className="bg-indigo-900 text-white border-none text-[10px]">
              New Workspace
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
