'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { deepenBrandBook } from '@/lib/api/brandBook.client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useBrandMdDirtyOptional } from './BrandMdDirtyContext';

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
  // Suppress auto-refresh while the user has unsaved edits in BrandMdEditor —
  // a Realtime-triggered router.refresh() would wipe in-flight draft content.
  const editorIsDirty = useBrandMdDirtyOptional();
  // Keep a ref so the channel callback always reads the latest value without
  // re-subscribing on every dirty/clean toggle.
  const editorIsDirtyRef = useRef(editorIsDirty);
  useEffect(() => {
    editorIsDirtyRef.current = editorIsDirty;
  }, [editorIsDirty]);

  useEffect(() => {
    const channel = supabase
      .channel(`brand_book_${brandId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'brand_profiles',
          table: 'brand_report_composites',
          filter: `brand_profile_id=eq.${brandId}`,
        },
        () => {
          // The composite changed (e.g. the deep pass landed) — re-run the RSC
          // fetch so the viewer reflects the new tiers without a manual reload.
          // Skip the refresh when the editor has unsaved changes: blowing away a
          // draft mid-edit is worse than the viewer being briefly stale.
          if (!editorIsDirtyRef.current) {
            router.refresh();
          }
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
            res.status === 'already_running'
              ? 'Deep analysis already running'
              : 'Deep analysis started',
          description: 'The deeper sections of your Brand Book will fill in shortly.',
          variant: 'success',
        });
      } catch (e) {
        show({
          title: "Couldn't start deep analysis",
          description: e instanceof Error ? e.message : 'Please try again.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <Button onClick={handleDeepen} disabled={isPending} variant="secondary">
      {isPending ? 'Starting…' : 'Deepen analysis'}
    </Button>
  );
}
