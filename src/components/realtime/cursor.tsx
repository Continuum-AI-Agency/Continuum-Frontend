"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface CursorProps {
  x: number
  y: number
  color: string
  name: string
  className?: string
  isLocal?: boolean
}

export function Cursor({ x, y, color, name, className, isLocal = false }: CursorProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-[9999] flex flex-col items-start transition-all",
        isLocal && "animate-pulse-glow",
        className
      )}
      style={{
        left: x,
        top: y,
        transform: "translate(-2px, -2px)",
        ...(isLocal && {
          filter: `drop-shadow(0 0 8px ${color})`,
        }),
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill={color}
        className="drop-shadow-sm"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500001 16.8829L0.500001 0.705841L11.7841 11.2741L6.65692 11.2741L6.48069 11.2741L6.34731 11.3891L5.65376 12.3673Z"
          stroke="white"
          strokeWidth="1"
        />
      </svg>
      <div
        className="mt-1 ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white shadow-md ring-1 ring-white/20 whitespace-nowrap"
        style={{ backgroundColor: color }}
      >
        {name}
      </div>
    </div>
  )
}
