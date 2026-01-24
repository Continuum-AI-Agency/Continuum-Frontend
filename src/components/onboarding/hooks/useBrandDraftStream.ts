"use client";

import { useState, useRef, useCallback } from "react";
import { readServerSentEvents } from "@/lib/sse/readServerSentEvents";
import { useToast } from "@/components/ui/ToastProvider";

type DraftState = {
  voice: string;
  audience: string;
  isDrafting: boolean;
};

export function useBrandDraftStream(brandId: string) {
  const [drafts, setDrafts] = useState<DraftState>({
    voice: "",
    audience: "",
    isDrafting: false,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const { show } = useToast();

  const stopDraft = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setDrafts((prev) => ({ ...prev, isDrafting: false }));
  }, []);

  const startDraft = useCallback(async (websiteUrl: string) => {
    if (!websiteUrl || websiteUrl.trim().length < 5) return;
    
    stopDraft();
    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;
    
    setDrafts({
      voice: "",
      audience: "",
      isDrafting: true,
    });

    const trimmedUrl = websiteUrl.trim();
    let voiceBuffer = "";
    let audienceBuffer = "";

    const streamVoice = async () => {
      try {
        const response = await fetch(`/api/onboarding/brand-draft-voice?brand=${encodeURIComponent(brandId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: trimmedUrl }),
          signal: ctrl.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to start voice draft");
        }

        const reader = response.body.getReader();
        await readServerSentEvents({
          reader,
          signal: ctrl.signal,
          onEvent: (eventName, rawPayload) => {
            if (!eventName) return;
            const payload = rawPayload.trim();
            switch (eventName) {
              case "brandVoice": {
                try {
                  const parsed = JSON.parse(payload);
                  const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
                  if (!delta) break;
                  voiceBuffer += delta;
                  setDrafts((prev) => ({ ...prev, voice: voiceBuffer }));
                } catch {
                  
                }
                break;
              }
              case "error":
                break;
            }
          },
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        console.error("Voice stream error", e);
      }
    };

    const streamAudience = async () => {
      try {
        const response = await fetch(`/api/onboarding/brand-draft-audience?brand=${encodeURIComponent(brandId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: trimmedUrl }),
          signal: ctrl.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to start audience draft");
        }

        const reader = response.body.getReader();
        await readServerSentEvents({
          reader,
          signal: ctrl.signal,
          onEvent: (eventName, rawPayload) => {
            if (!eventName) return;
            const payload = rawPayload.trim();
            switch (eventName) {
              case "targetAudience": {
                try {
                  const parsed = JSON.parse(payload);
                  const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
                  if (!delta) break;
                  audienceBuffer += delta;
                  setDrafts((prev) => ({ ...prev, audience: audienceBuffer }));
                } catch {
                  
                }
                break;
              }
              case "error":
                break;
            }
          },
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        console.error("Audience stream error", e);
      }
    };

    try {
      await Promise.allSettled([streamVoice(), streamAudience()]);
    } finally {
      if (!ctrl.signal.aborted) {
        setDrafts((prev) => ({ ...prev, isDrafting: false }));
      }
      abortControllerRef.current = null;
    }
  }, [brandId, stopDraft]);

  return {
    ...drafts,
    startDraft,
    stopDraft,
  };
}
