"use client";

import React, { useRef, useState } from "react";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { uploadCreativeAsset } from "@/lib/creative-assets/storageClient";
import { enqueueDocumentEmbedAction, removeDocumentAction } from "@/app/onboarding/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";

export function DocumentUploader() {
  const { brandId, state, updateState } = useOnboarding();
  const { show } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const documents = state.documents || [];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    e.stopPropagation();

    setIsUploading(true);
    setUploadProgress(10);

    const fileList = Array.from(files);
    let completed = 0;

    for (const file of fileList) {
      try {
        const { asset } = await uploadCreativeAsset(brandId, "documents", file);
        
        setUploadProgress((prev) => prev + (80 / fileList.length));

        const nextState = await enqueueDocumentEmbedAction(brandId, {
          name: file.name,
          source: "upload",
          storagePath: asset.fullPath,
          mimeType: file.type,
          fileName: file.name,
          size: file.size,
        });

        await updateState({ documents: nextState.documents });
        completed++;
      } catch (error) {
        console.error("Failed to upload document", file.name, error);
        show({ 
          title: "Upload Failed", 
          description: `Could not upload ${file.name}`, 
          variant: "error" 
        });
      }
    }

    setUploadProgress(100);
    setTimeout(() => {
      setIsUploading(false);
      setUploadProgress(0);
    }, 500);

    if (inputRef.current) inputRef.current.value = "";
    
    if (completed > 0) {
      show({ 
        title: "Documents Uploaded", 
        description: `Added ${completed} file(s) to knowledge base.`, 
        variant: "success" 
      });
    }
  };

  const handleRemove = async (e: React.MouseEvent, docId: string) => {
    e.preventDefault(); 
    e.stopPropagation();
    try {
      const nextState = await removeDocumentAction(brandId, docId);
      await updateState({ documents: nextState.documents });
    } catch (error) {
      show({ title: "Remove Failed", description: "Could not remove document.", variant: "error" });
    }
  };

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
              disabled={isUploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </div>
        </div>
        {isUploading && <Progress value={uploadProgress} className="h-1 mt-2" />}
      </CardHeader>
      
      {documents.length > 0 && (
        <CardContent className="pt-0">
          <ScrollArea className="h-[120px] pr-4">
            <div className="space-y-2">
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
                        {isUploading && doc.status === "processing" ? "Analyzing..." : "Ready"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isUploading && doc.status === "processing" && (
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
                      onClick={(e) => handleRemove(e, doc.id)}
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
