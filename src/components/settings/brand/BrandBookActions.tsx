'use client';

import type { BrandBookResponse } from '@continuum/contracts';
import { Download, FileText, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { deepenBrandBook } from '@/lib/api/brandBook.client';
import {
  buildBrandSystemExport,
  downloadBrandBookPdf,
  downloadBrandSystemArchive,
} from '@/lib/brands/brand-system-export';
import { subscribeToRowBroadcasts } from '@/lib/supabase/realtime';
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
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

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
    // A change signal: the trigger sends no composite, the RSC re-read fetches it.
    return subscribeToRowBroadcasts({
      topic: `brand_report_composites:${brandId}`,
      bindings: [
        {
          event: 'UPDATE',
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
          title: res.status === 'already_running' ? tUi('m_3dcb164c2b') : tUi('m_c4f979950c'),
          description: tUi('m_932084657f'),
          variant: 'success',
        });
      } catch (e) {
        show({
          title: tUi('m_6cb8c209ea'),
          description: uiErrorMessage(e),
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
        title: format === 'zip' ? tUi('m_7875ec197a') : tUi('m_05f0ab7207'),
        description:
          warningCount > 0
            ? tUi('m_093063219d', { v0: String(warningCount) })
            : format === 'zip'
              ? tUi('m_46664d29a1')
              : tUi('m_beccfa8587'),
        variant: 'success',
      });
    } catch (error) {
      show({
        title: tUi('m_d6c17e9bd7'),
        description: error instanceof Error ? uiErrorMessage(error) : tUi('m_83a6fd7b78'),
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
              title={editorIsDirty ? tUi('m_81d7fb23cd') : undefined}
            >
              <Download aria-hidden />
              {exporting ? tUi('m_583cccdcd1') : tUi('m_f3e4fadb9e')}
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
              <span>{tUi('m_9872d8677f')}</span>
              <span className="text-xs text-muted-foreground">{tUi('m_4fd67b33be')}</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={editorIsDirty || exporting !== null}
            onSelect={() => void handleExport('pdf')}
          >
            <FileText aria-hidden />
            <span className="flex flex-col">
              <span>{tUi('m_98e5ef062b')}</span>
              <span className="text-xs text-muted-foreground">{tUi('m_a7c79f179e')}</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button onClick={handleDeepen} disabled={isPending} variant="secondary">
        {isPending ? tUi('m_e5f58095ac') : tUi('m_50a4dfae79')}
      </Button>
    </div>
  );
}
