"use client";

import React from "react";
import { ReactFlowProvider, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { Button } from "@radix-ui/themes";

type CanvasWrapperProps = {
  children: React.ReactNode;
  nodes: Node[];
  edges: Edge[];
};

export function CanvasWrapper({ children, nodes, edges }: CanvasWrapperProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="relative w-full h-full">
      <ReactFlowProvider>
        {children}
      </ReactFlowProvider>
      <div className="absolute bottom-4 right-4 z-50">
        <div className="rounded-lg border border-white/10 bg-slate-900/95 p-2 shadow-xl">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => zoomIn({ duration: 300 })}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              aria-label="Zoom in"
            >
              <span className="text-lg font-medium">+</span>
            </button>
            <button
              type="button"
              onClick={() => zoomOut({ duration: 300 })}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              aria-label="Zoom out"
            >
              <span className="text-lg font-medium">−</span>
            </button>
            <button
              type="button"
              onClick={() => fitView({ padding: 0.1, duration: 300 })}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              aria-label="Fit view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M2 2l10 10m0-10L2 12m1-1h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
