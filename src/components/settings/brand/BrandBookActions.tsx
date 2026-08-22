'use client';

import type { BrandBookResponse } from '@continuum/contracts';
import { Download, FileText, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/ToastProvider';
import { deepenBrandBook } from '@/lib/api/brandBook.client';
import {
  buildBrandSystemExport,
  downloadBrandBookPdf,
  downloadBrandSystemArchive,
} from '@/lib/brands/brand-system-export';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { useBrandMdDirtyOptional } from './BrandMdDirtyContext';

/**
 * Brand Book interactivity: a "Deepen analysis" trigger + a realtime listener
 * that refreshes the (RSC-fetched) viewer when the durable deep job merges new
 * content into the composite. Replaces the orphaned StrategicAnalysisRealtime
 * plumbing — this one watches the canonical composite the viewer actually reads.
 */
export function BrandBookActions({
  brandBook,
  brandName,
}: {
  brandBook: BrandBookResponse;
  brandName: string;
}) {
  const brandId = brandBook.brand_id;
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState<'zip' | 'pdf' | null>(null);
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
    return subscribeToPostgresChanges({
      label: `brand_book_${brandId}`,
      bindings: [
        {
          event: 'UPDATE',
          schema: 'brand_profiles',
          table: 'brand_report_composites',
          filter: `brand_profile_id=eq.${brandId}`,
          onRow: () => {
            // The composite changed (e.g. the deep pass landed) — re-run the RSC
            // fetch so the viewer reflects the new tiers without a manual reload.
            // Skip the refresh when the editor has unsaved changes: blowing away a
            // draft mid-edit is worse than the viewer being briefly stale.
            if (!editorIsDirtyRef.current) {
              router.refresh();
            }
          },
        },
      ],
    });
  }, [brandId, router]);

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

  const handleExport = async (format: 'zip' | 'pdf') => {
    if (editorIsDirty || exporting) return;
    setExporting(format);
    try {
      const exported = await buildBrandSystemExport({ brandBook, brandName });
      if (format === 'zip') downloadBrandSystemArchive(exported);
      else downloadBrandBookPdf(exported);

      const warningCount = exported.manifest.warnings.length;
      show({
        title: format === 'zip' ? 'Brand system exported' : 'Brand Book PDF exported',
        description:
          warningCount > 0
            ? `${warningCount} optional item could not be included. See manifest.json for details.`
            : format === 'zip'
              ? 'Includes portable tokens, normalized knowledge, available assets, and PDF.'
              : 'Your current saved Brand Book is ready to share.',
        variant: 'success',
      });
    } catch (error) {
      show({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              disabled={editorIsDirty || exporting !== null}
              title={editorIsDirty ? 'Save or discard brand.md edits before exporting.' : undefined}
            >
              <Download aria-hidden />
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={editorIsDirty || exporting !== null}
            onSelect={() => void handleExport('zip')}
          >
            <Package aria-hidden />
            <span className="flex flex-col">
              <span>Download brand system</span>
              <span className="text-xs text-muted-foreground">
                ZIP with tokens, assets, and PDF
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={editorIsDirty || exporting !== null}
            onSelect={() => void handleExport('pdf')}
          >
            <FileText aria-hidden />
            <span className="flex flex-col">
              <span>Download PDF</span>
              <span className="text-xs text-muted-foreground">Shareable Brand Book</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button onClick={handleDeepen} disabled={isPending} variant="secondary">
        {isPending ? 'Starting…' : 'Deepen analysis'}
      </Button>
    </div>
  );
}
