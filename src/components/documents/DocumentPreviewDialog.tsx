"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { DocumentView } from "./types";

const NutrientViewer = dynamic(
  () => import("./NutrientViewer").then((mod) => mod.NutrientViewer),
  { ssr: false, loading: () => <ViewerLoading /> },
);

function ViewerLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

type DocumentPreviewDialogProps = {
  document: DocumentView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolveSignedUrl: (storagePath: string) => Promise<string>;
};

export function DocumentPreviewDialog({
  document,
  open,
  onOpenChange,
  onResolveSignedUrl,
}: DocumentPreviewDialogProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !document?.storagePath) {
      setSignedUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    onResolveSignedUrl(document.storagePath)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [document?.storagePath, onResolveSignedUrl, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85vh] max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-sm font-medium">
            {document?.name ?? "Document preview"}
          </DialogTitle>
        </DialogHeader>
        <div className="relative h-full w-full">
          {error ? (
            <div className="p-4 text-sm text-rose-600" role="alert">
              {error}
            </div>
          ) : signedUrl ? (
            <NutrientViewer documentUrl={signedUrl} className="h-full w-full" />
          ) : (
            <ViewerLoading />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
