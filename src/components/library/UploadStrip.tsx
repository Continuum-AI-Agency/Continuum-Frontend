"use client";

import { motion } from "motion/react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadItem } from "./useMediaUpload";

export function UploadStrip({ uploads }: { uploads: UploadItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-wrap gap-2"
    >
      {uploads.map((u) => (
        <span
          key={u.id}
          className={cn(
            "flex max-w-[220px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
            u.status === "uploading" && "border-border/60 bg-muted/50 text-muted-foreground",
            u.status === "done" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            u.status === "error" && "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
          )}
          title={u.status === "error" ? u.error : u.name}
        >
          {u.status === "uploading" && <Loader2 className="size-3 shrink-0 animate-spin" />}
          {u.status === "done" && <Check className="size-3 shrink-0" />}
          {u.status === "error" && <AlertCircle className="size-3 shrink-0" />}
          <span className="truncate">{u.name}</span>
        </span>
      ))}
    </motion.div>
  );
}
