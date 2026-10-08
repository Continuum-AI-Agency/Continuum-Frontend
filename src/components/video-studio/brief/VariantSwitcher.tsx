'use client';

import type { VideoEditorOpOutput } from '@continuum/contracts';
import { Download, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type StudioVideoOrigin, studioVideoHref } from '@/lib/ai-studio/studioVideoHref';
import { runVideoEditorOp } from '@/lib/api/videoEditorOps.client';
import { ExportDialog } from '../export/ExportDialog';
import { formatDuration } from '../sources/PoolAssetCard';
import type { VideoStudioContext } from '../types';

type Variant = VideoEditorOpOutput<'list_variants'>['variants'][number];

/**
 * A/B/C for a project drafted from a brief: each tab is a sibling project, its angle in the
 * tooltip. Switching opens that sibling on this same route (same `origin`); "Redraft all
 * variants" reopens the brief, and the redraft rewrites these same siblings in place;
 * "Export all variants" renders every sibling with one platform preset.
 */
export function VariantSwitcher({
  studio,
  origin,
  reloadKey,
  onRedraft,
}: {
  studio: VideoStudioContext;
  origin: StudioVideoOrigin;
  /** Bumped when a draft lands, so the siblings are read again. */
  reloadKey: number;
  onRedraft: (variantCount: number) => void;
}): React.ReactNode {
  const router = useRouter();
  const { brief, projectId, durationSec } = studio.project;
  const [variants, setVariants] = useState<Variant[]>([]);
  // Redraft counts the tabs: until list_variants answers, the only tab is this project, so
  // a failed read keeps the family actions off rather than redrafting one variant of three.
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey and attempt are re-read triggers
  useEffect(() => {
    if (!brief) return;
    let cancelled = false;
    setReadError(null);
    // A read: straight to the op, so it never shows as the workspace being busy.
    runVideoEditorOp(projectId, 'list_variants', {})
      .then((result) => {
        if (cancelled) return;
        setVariants(result.variants);
        setAnsweredFor(projectId);
      })
      .catch((error: unknown) => {
        if (!cancelled) setReadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [brief?.briefId, projectId, reloadKey, attempt]);

  if (!brief) return null;
  // Until the siblings are read, the project's own brief names its tab.
  const tabs: Variant[] = variants.some((variant) => variant.projectId === projectId)
    ? variants
    : [
        {
          projectId,
          label: brief.variantLabel,
          title: studio.project.title,
          ...(brief.angle ? { angle: brief.angle } : {}),
          durationSec,
          editorPath: '',
          current: true,
        },
      ];

  return (
    <div className="flex items-center gap-1" data-testid="variant-switcher">
      <Tabs
        value={projectId}
        onValueChange={(value) => {
          const target = tabs.find((variant) => variant.projectId === value);
          if (target && !target.current) {
            router.push(studioVideoHref({ projectId: target.projectId, origin }));
          }
        }}
      >
        <TabsList className="h-8">
          {tabs.map((variant) => (
            <Tooltip key={variant.projectId}>
              <TooltipTrigger
                render={
                  <TabsTrigger
                    value={variant.projectId}
                    data-variant={variant.label}
                    className="h-7 gap-1.5 px-2 text-xs"
                  />
                }
              >
                <span className="font-semibold">{variant.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatDuration(
                    variant.projectId === projectId ? durationSec : variant.durationSec,
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">{variant.angle || variant.title}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>
      </Tabs>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1 text-xs"
        disabled={answeredFor !== projectId}
        onClick={() => onRedraft(Math.max(tabs.length, 1))}
      >
        <RotateCcw className="size-3.5" /> Redraft all variants
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1 text-xs"
        disabled={answeredFor !== projectId}
        onClick={() => setExportOpen(true)}
      >
        <Download className="size-3.5" /> Export all variants
      </Button>
      {readError ? (
        <span role="alert" className="flex items-center gap-1 text-xs text-destructive">
          {readError}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setAttempt((count) => count + 1)}
          >
            Retry
          </Button>
        </span>
      ) : null}
      <ExportDialog studio={studio} open={exportOpen} onOpenChange={setExportOpen} allVariants />
    </div>
  );
}
