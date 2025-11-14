import React from "react";

export function GlassPanel({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={
        "bg-slate-950/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl " +
        className
      }
      {...props}
    />
  );
}


