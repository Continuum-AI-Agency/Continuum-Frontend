"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type ThinkingStatusGridProps = {
  isActive: boolean;
  className?: string;
};

const CELLS = Array.from({ length: 9 }, (_, index) => index);
const CELL_SIZE = 4;
const CELL_GAP = 4;
const STEP = CELL_SIZE + CELL_GAP;

const PATH = [0, 1, 2, 5, 8, 7, 6, 3, 4];
const PATH_X = PATH.map((cell) => (cell % 3) * STEP);
const PATH_Y = PATH.map((cell) => Math.floor(cell / 3) * STEP);

function getCellScale(index: number, isActive: boolean): number[] {
  if (!isActive) return [0.9, 0.9, 0.9];
  const pulse = PATH.includes(index);
  return pulse ? [0.9, 1, 0.9] : [0.9, 0.92, 0.9];
}

export function ThinkingStatusGrid({ isActive, className }: ThinkingStatusGridProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative inline-flex h-5 w-5 items-center justify-center", className)}
    >
      <div className="grid grid-cols-3 gap-1">
        {CELLS.map((cell, index) => (
          <motion.span
            key={cell}
            className="rounded-[2px] bg-foreground/50"
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
            animate={{
              opacity: isActive ? [0.45, 0.95, 0.45] : 0.55,
              scale: getCellScale(index, isActive),
            }}
            transition={{
              duration: 1.25,
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.04,
            }}
          />
        ))}
      </div>

      {isActive ? (
        <motion.span
          className="absolute left-0 top-0 rounded-[2px] bg-primary shadow-[0_0_10px_rgba(236,72,153,0.55)]"
          style={{ width: CELL_SIZE, height: CELL_SIZE }}
          animate={{
            x: PATH_X,
            y: PATH_Y,
            opacity: [0.85, 1, 0.85],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ) : null}
    </div>
  );
}
