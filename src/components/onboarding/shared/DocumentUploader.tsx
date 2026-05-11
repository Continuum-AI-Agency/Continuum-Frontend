"use client";

import React, { useRef, useState } from "react";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { removeDocumentAction } from "@/app/onboarding/actions";
import { createSignedDocumentUrlAction } from "@/app/(post-auth)/settings/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, X, Loader2, Download, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";

type PendingFile = {
  key: string;
  file: File;
  status: "uploading" | "error";
  error?: string;
};

export function DocumentUploader() {
  const { brandId, state, updateState } = useOnboarding();
  const { show } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const documents = state.documents || [];

  const uploadOne = async (entry: PendingFile): Promise<boolean> => {
    setPendingFiles((prev) =>
      prev.map((p) => (p.key === entry.key ? { ...p, status: "uploading", error: undefined } : p))
    );
    try {
      const formData = new FormData();
      formData.append("brandId", brandId);
      formData.append("file", entry.file);
      formData.append("source", "upload");

      const response = await fetch("/api/onboarding/documents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Upload failed (${response.status})`);
      }

      const data = await response.json();
      await updateState({ documents: data.state.documents });
      setPendingFiles((prev) => prev.filter((p) => p.key !== entry.key));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to upload ${entry.file.name}`;
      setPendingFiles((prev) =>
        prev.map((p) => (p.key === entry.key ? { ...p, status: "error", error: message } : p))
      );
      return false;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.stopPropagation();

    const fresh: PendingFile[] = Array.from(files).map((file, idx) => ({
      key: `${Date.now()}-${idx}-${file.name}`,
      file,
      status: "uploading",
    }));
    setPendingFiles((prev) => [...prev, ...fresh]);

    let succeeded = 0;
    for (const entry of fresh) {
      const ok = await uploadOne(entry);
      if (ok) succeeded += 1;
    }

    if (inputRef.current) inputRef.current.value = "";
    if (succeeded > 0) {
      show({
        title: "Documents Uploaded",
        description: `Added ${succeeded} file(s) to knowledge base.`,
        variant: "success",
      });
    }
  };

  const handleRetry = (key: string) => {
    const entry = pendingFiles.find((p) => p.key === key);
    if (!entry) return;
    void uploadOne(entry);
  };

  const handleDiscardPending = (key: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.key !== key));
  };

  const handleRemove = async (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const nextState = await removeDocumentAction(brandId, docId);
      await updateState({ documents: nextState.documents });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove document.";
      show({ title: "Remove Failed", description: message, variant: "error" });
    }
  };

  const handleDownload = async (e: React.MouseEvent, storagePath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!storagePath) {
      show({ title: "Download Failed", description: "Storage path not found.", variant: "error" });
      return;
    }
    try {
      const signedUrl = await createSignedDocumentUrlAction(storagePath);
      window.open(signedUrl, "_blank");
    } catch {
      show({ title: "Download Failed", description: "Failed to generate download link.", variant: "error" });
    }
  };

  const hasRows = pendingFiles.length > 0 || documents.length > 0;
  const anyUploading = pendingFiles.some((p) => p.status === "uploading");

  return (
    <Card className="w-full border-dashed border-2 shadow-none bg-muted/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Knowledge Base
            </CardTitle>
            <CardDescription>
              Upload existing brand guidelines, PDFs, or presentations.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={inputRef}
              multiple
              className="hidden"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                inputRef.current?.click();
              }}
              disabled={anyUploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </div>
        </div>
      </CardHeader>

      {hasRows && (
        <CardContent className="pt-0">
          <ScrollArea className="h-[160px] pr-4">
            <div className="space-y-2">
              {pendingFiles.map((entry) => (
                <div
                  key={entry.key}
                  className="flex items-center justify-between p-2 rounded-md bg-background border text-sm group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={entry.status === "error" ? "bg-destructive/10 p-1.5 rounded" : "bg-primary/10 p-1.5 rounded"}>
                      {entry.status === "error" ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <FileText className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{entry.file.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize truncate">
                        {entry.status === "uploading" ? "Uploading…" : entry.error ?? "Failed"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.status === "uploading" ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRetry(entry.key)}
                          title="Retry"
                        >
                          <RefreshCw className="h-3 w-3 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDiscardPending(entry.key)}
                          title="Discard"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-2 rounded-md bg-background border text-sm group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-primary/10 p-1.5 rounded">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{doc.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {doc.status === "processing" ? "Analyzing..." : doc.status === "error" ? "Indexing failed" : "Ready"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {doc.status === "processing" && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                    {doc.status === "ready" && (
                      <Badge variant="secondary" className="text-[10px] h-5 bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
                        Indexed
                      </Badge>
                    )}
                    {doc.status === "error" && (
                      <Badge variant="destructive" className="text-[10px] h-5">
                        Error
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDownload(e, doc.storagePath || "")}
                      title="Download"
                    >
                      <Download className="h-3 w-3 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleRemove(e, doc.id)}
                      title="Remove"
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
