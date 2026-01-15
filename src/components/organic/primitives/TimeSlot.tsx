"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export function TimeSlot({
  date,
  time,
  children,
  className,
}: {
  date: string;
  time: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${date}T${time}`,
    data: { date, time, type: "timeslot" },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative transition-colors",
        isOver && "bg-brand-primary/10",
        className
      )}
    >
      {isOver && (
        <div className="absolute inset-0 border-2 border-dashed border-brand-primary/50 rounded pointer-events-none z-10" />
      )}
      {children}
    </div>
  );
}
