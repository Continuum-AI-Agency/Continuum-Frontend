"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { streamGeneration } from "@/lib/onboarding/inspirationsClient";
import type {
  GenerationDirection,
  OnboardingGeneratedImage,
  OnboardingGenerationStreamFrame,
} from "@continuum/contracts";
import type { SelectedInspiration } from "./CompetitorInspirationsScreen";

const DIRECTION_LABEL: Record<GenerationDirection, string> = {
  product: "Product-led",
  brand_awareness: "Brand awareness",
  hybrid: "Hybrid",
};

type Phase = "generating" | "done" | "error";

type Props = {
  brandId: string;
  reference: SelectedInspiration | null;
  onFinish: () => void;
  finishing: boolean;
  onBack: () => void;
};

export function InspirationGenerationScreen({ brandId, reference, onFinish, finishing, onBack }: Props) {
  const [total, setTotal] = useState(3);
  const [images, setImages] = useState<OnboardingGeneratedImage[]>([]);
  const [phase, setPhase] = useState<Phase>("generating");
  const startedRef = useRef(false);
  const erroredRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const controller = new AbortController();

    const handleFrame = (frame: OnboardingGenerationStreamFrame) => {
      switch (frame.type) {
        case "generation_started":
          setTotal(frame.data.total);
          break;
        case "image_ready":
          setImages((prev) => [...prev, frame.data]);
          break;
        case "generation_complete":
          setPhase("done");
          break;
        case "error":
          erroredRef.current = true;
          break;
      }
    };

    void streamGeneration({
      brandId,
      referenceImageUrl: reference?.imageUrl ?? null,
      competitorName: reference?.competitorName ?? null,
      signal: controller.signal,
      onFrame: handleFrame,
    })
      // The server signals failure with an error FRAME and then ends the stream
      // cleanly, so the promise resolves without a completion frame. Settle the
      // phase on stream end too — otherwise the screen is stuck "generating" and
      // the "Go to dashboard" button never enables.
      .then(() =>
        setPhase((p) => (p === "generating" ? (erroredRef.current ? "error" : "done") : p)),
      )
      .catch(() => setPhase("error"));

    return () => controller.abort();
  }, [brandId, reference]);

  const slots = Array.from({ length: Math.max(total, images.length) });

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 pb-28 md:px-8">
      <header className="py-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Your first on-brand creatives</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generated from your brand guidelines{reference ? ` and inspiration from ${reference.competitorName}` : ""}.
          They&apos;re saving to your library now.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {slots.map((_, index) => {
          const image = images[index];
          return (
            <div
              key={image?.assetId ?? `slot-${index}`}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
                !image && "animate-pulse",
              )}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.signedUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  {phase === "error" ? "Generation failed" : "Generating…"}
                </div>
              )}
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {image ? DIRECTION_LABEL[image.direction] : " "}
              </div>
            </div>
          );
        })}
      </div>

      {phase === "error" && images.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          We couldn&apos;t generate previews right now — you can continue and create them later in the studio.
        </p>
      ) : null}

      <footer className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
        <Button variant="outline" size="sm" onClick={onBack} disabled={finishing}>
          ← Back
        </Button>
        <Button variant="success" size="sm" onClick={onFinish} disabled={finishing || phase === "generating"}>
          {finishing ? "Finishing…" : "Go to dashboard ✦"}
        </Button>
      </footer>
    </div>
  );
}
