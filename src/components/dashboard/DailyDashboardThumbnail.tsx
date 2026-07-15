"use client";

import { useState } from "react";

export function DailyDashboardThumbnail({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt={alt} className="h-16 w-16 shrink-0 rounded-md border border-border/70 object-cover" onError={() => setFailed(true)} />;
}
