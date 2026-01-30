"use client"

import React from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface AvatarData {
  name: string
  image?: string
  fallback?: string
  email?: string
}

export interface AvatarStackProps {
  avatars: AvatarData[]
  max?: number
  className?: string
}

export function AvatarStack({ avatars, max = 5, className }: AvatarStackProps) {
  const visibleAvatars = avatars.slice(0, max)
  const remainingCount = avatars.length - max

  return (
    <TooltipProvider>
      <div className={cn("flex -space-x-2 items-center", className)}>
        {visibleAvatars.map((avatar, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <Avatar className="border-2 border-background ring-1 ring-white/10 h-8 w-8">
                {avatar.image && <AvatarImage src={avatar.image} alt={avatar.name} />}
                <AvatarFallback className="text-[10px] font-bold">
                  {avatar.fallback || avatar.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <div className="font-medium">{avatar.name}</div>
                {avatar.email && <div className="text-xs text-muted-foreground">{avatar.email}</div>}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {remainingCount > 0 && (
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted border-2 border-background text-[10px] font-bold text-muted-foreground ring-1 ring-white/10 z-10">
            +{remainingCount}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
