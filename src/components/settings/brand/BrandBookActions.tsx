"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@radix-ui/themes";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { deepenBrandBook } from "@/lib/api/brandBook.client";

/**
 * Brand Book interactivity: a "Deepen analysis" trigger + a realtime listener
 * that refreshes the (RSC-fetched) viewer when the durable deep job merges new
 * content into the composite. Replaces the orphaned StrategicAnalysisRealtime
 * plumbing — this one watches the canonical composite the viewer actually reads.
 */
export function BrandBookActions({ brandId }: { brandId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const channel = supabase
      .channel(`brand_book_${brandId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "brand_profiles",
          table: "brand_report_composites",
          filter: `brand_profile_id=eq.${brandId}`,
        },
        () => {
          // The composite changed (e.g. the deep pass landed) — re-run the RSC
          // fetch so the viewer reflects the new tiers without a manual reload.
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, supabase, router]);

  const handleDeepen = () => {
    startTransition(async () => {
      try {
        const res = await deepenBrandBook(brandId);
        show({
          title:
            res.status === "already_running"
              ? "Deep analysis already running"
              : "Deep analysis started",
          description: "The deeper sections of your Brand Book will fill in shortly.",
          variant: "success",
        });
      } catch (e) {
        show({
          title: "Couldn't start deep analysis",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "error",
        });
      }
    });
  };

  return (
    <Button onClick={handleDeepen} disabled={isPending} variant="soft" size="2">
      {isPending ? "Starting…" : "Deepen analysis"}
    </Button>
  );
}
