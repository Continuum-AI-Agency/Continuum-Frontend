import React from "react";

export function GlassPanel({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={"backdrop-blur-xl rounded-3xl shadow-2xl " + className}
      style={{
        backgroundColor: "var(--glass-bg)",
        border: `1px solid var(--glass-border)`,
        color: "var(--foreground)",
        ...(props.style || {}),
      }}
      {...props}
    />
  );
}

