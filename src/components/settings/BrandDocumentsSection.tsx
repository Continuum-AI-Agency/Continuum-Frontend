"use client";

import React, { useRef, useState, useEffect } from "react";
import { Flex, Heading, Text, Button, Grid, Badge, IconButton } from "@radix-ui/themes";
import { FileIcon, UploadIcon, Cross2Icon, UpdateIcon, DownloadIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import type { OnboardingDocument } from "@/lib/onboarding/state";
import { removeDocumentAction } from "@/app/onboarding/actions";
import { createSignedDocumentUrlAction } from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface BrandDocumentsSectionProps {
  brandId: string;
  documents: OnboardingDocument[];
}

export function BrandDocumentsSection({ brandId, documents: initialDocuments }: BrandDocumentsSectionProps) {
  const router = useRouter();
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<OnboardingDocument[]>(initialDocuments);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    
    const channel = supabase
      .channel(`brand-documents-${brandId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "brand_profiles",
          table: "brand_documents",
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updatedDoc = payload.new as any;
            setDocuments((prev) => 
              prev.map((doc) => 
                doc.id === updatedDoc.id 
                  ? { 
                      ...doc, 
                      status: updatedDoc.status, 
                      errorMessage: updatedDoc.error_message,
                      mimeType: updatedDoc.mime_type
                    } 
                  : doc
              )
            );
          } else if (payload.eventType === "INSERT") {
            router.refresh();
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            setDocuments((prev) => prev.filter((doc) => doc.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandId, router]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("brandId", brandId);
    
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const singleFileFormData = new FormData();
      singleFileFormData.append("brandId", brandId);
      singleFileFormData.append("file", file);
      singleFileFormData.append("source", "upload");

      try {
        const response = await fetch("/api/onboarding/documents", {
          method: "POST",
          body: singleFileFormData,
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
        successCount++;
      } catch (error) {
        console.error("Upload error:", error);
        failCount++;
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (successCount > 0) {
      show({
        title: "Upload Successful",
        description: `Successfully uploaded ${successCount} document(s).`,
        variant: "success",
      });
      router.refresh();
    }

    if (failCount > 0) {
      show({
        title: "Upload Partial Failure",
        description: `Failed to upload ${failCount} document(s).`,
        variant: "error",
      });
    }
  };

  const handleRemove = async (documentId: string) => {
    try {
      await removeDocumentAction(brandId, documentId);
      show({
        title: "Document Removed",
        description: "The document has been removed from your knowledge base.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      console.error("Remove error:", error);
      show({
        title: "Error",
        description: "Failed to remove the document.",
        variant: "error",
      });
    }
  };

  const handleDownload = async (doc: OnboardingDocument) => {
    const hasStoragePath = typeof doc.storagePath === "string" && doc.storagePath.trim().length > 0;
    const hasExternalUrl = typeof doc.externalUrl === "string" && doc.externalUrl.trim().length > 0;

    if (!hasStoragePath && !hasExternalUrl) {
      show({
        title: "Error",
        description: "No downloadable source found for this document.",
        variant: "error",
      });
      return;
    }

    const popupWindow = window.open("", "_blank", "noopener,noreferrer");
    setDownloadingDocumentId(doc.id);
    try {
      let downloadUrl = "";
      if (hasStoragePath) {
        downloadUrl = await createSignedDocumentUrlAction(doc.storagePath!);
      } else if (hasExternalUrl) {
        downloadUrl = doc.externalUrl!;
      }

      if (popupWindow) {
        popupWindow.location.href = downloadUrl;
      } else {
        window.location.assign(downloadUrl);
      }
    } catch (error) {
      if (popupWindow) {
        popupWindow.close();
      }
      console.error("Download error:", error);
      show({
        title: "Error",
        description: "Failed to generate download link.",
        variant: "error",
      });
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  return (
    <Flex direction="column" gap="4">
      <Flex justify="between" align="center">
        <Flex direction="column" gap="1">
          <Heading size="4">Knowledge Base</Heading>
          <Text size="2" color="gray">
            Processed documents used for strategic analysis and content generation.
          </Text>
        </Flex>
        <Flex gap="2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            style={{ display: "none" }}
            multiple
            accept=".pdf,.docx,.txt,.md"
          />
          <Button 
            variant="soft" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <UpdateIcon className="animate-spin" /> : <UploadIcon />}
            Upload Documents
          </Button>
        </Flex>
      </Flex>

      {documents.length === 0 ? (
        <Flex 
          direction="column" 
          align="center" 
          justify="center" 
          py="8" 
          className="border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50"
        >
          <FileIcon width="32" height="32" className="text-gray-300 mb-2" />
          <Text color="gray" size="2">No documents uploaded yet.</Text>
        </Flex>
      ) : (
        <Grid columns={{ initial: "1", md: "2" }} gap="3">
          {documents.map((doc) => {
            const canDownload =
              doc.status === "ready" &&
              ((typeof doc.storagePath === "string" && doc.storagePath.trim().length > 0) ||
                (typeof doc.externalUrl === "string" && doc.externalUrl.trim().length > 0));
            const isDownloading = downloadingDocumentId === doc.id;

            return (
              <Flex
                key={doc.id}
                p="3"
                align="center"
                justify="between"
                className="bg-white/5 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
              >
                <Flex align="center" gap="3" className="overflow-hidden">
                  <Flex
                    align="center"
                    justify="center"
                    className="w-10 h-10 rounded bg-blue-500/10 text-blue-500 shrink-0"
                  >
                    <FileIcon width="20" height="20" />
                  </Flex>
                  <Flex direction="column" className="overflow-hidden">
                    <Text size="2" weight="bold" className="truncate">
                      {doc.name}
                    </Text>
                    <Flex align="center" gap="2">
                      <Text size="1" color="gray">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </Text>
                      {doc.size && (
                        <Text size="1" color="gray">
                          • {(doc.size / 1024).toFixed(1)} KB
                        </Text>
                      )}
                    </Flex>
                  </Flex>
                </Flex>

                <Flex align="center" gap="3">
                  {doc.status === "processing" && (
                    <Badge color="blue" variant="soft">
                      <Flex align="center" gap="1">
                        <UpdateIcon className="animate-spin" />
                        Processing
                      </Flex>
                    </Badge>
                  )}
                  {doc.status === "ready" && <Badge color="green" variant="soft">Ready</Badge>}
                  {doc.status === "error" && <Badge color="red" variant="soft">Error</Badge>}

                  <Flex gap="1">
                    <IconButton
                      variant="ghost"
                      color="gray"
                      onClick={() => handleDownload(doc)}
                      size="1"
                      title={canDownload ? "Download" : "Download unavailable"}
                      disabled={!canDownload || isDownloading}
                    >
                      {isDownloading ? <UpdateIcon className="animate-spin" /> : <DownloadIcon />}
                    </IconButton>

                    <IconButton
                      variant="ghost"
                      color="gray"
                      onClick={() => handleRemove(doc.id)}
                      size="1"
                      title="Remove"
                    >
                      <Cross2Icon />
                    </IconButton>
                  </Flex>
                </Flex>
              </Flex>
            );
          })}
        </Grid>
      )}
    </Flex>
  );
}
