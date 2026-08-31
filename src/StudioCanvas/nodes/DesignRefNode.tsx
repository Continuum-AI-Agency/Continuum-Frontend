'use client';

// One named section of the brand design system, wired into a generator as a reference.
//
// Two ports, two different things. `image` is a SPECIMEN the generator can look at;
// `text` is the same section as prompt text. Which of them is live is `mode`.
//
// The specimen comes off a two-rung ladder. Rung 1 is the section's own DesignExemplar,
// emitted verbatim — pixel-exact, zero generation, and the brand's real work. Rung 2 is a
// generated reference plate, used when the section has no exemplar that is actually an
// image. Today every exemplar in production is `text/html` (the design-system export
// ships preview CARDS, UI kits and slides, which are web pages), so in practice every
// brand lands on rung 2. The footer says WHICH rung produced the specimen, because a
// generated approximation presented as the brand's own palette card is a lie the user
// cannot see through. The upgrade path for the HTML ones is a HyperFrames render.
//
// Generation runs through `executeGeneration` directly rather than the graph executor:
// a designRef is not `runnable`, and filling its own specimen is a node-local action, not
// a step in a canvas run.

import {
  DESIGN_REF_IMAGE_OUTPUT_HANDLE,
  DESIGN_REF_PRESETS,
  DESIGN_REF_TEXT_OUTPUT_HANDLE,
  DESIGN_SECTION_LABELS,
  type DesignRefMode,
  type DesignRefNodeData,
  type DesignSection,
  designRefSpecimenPrompt,
  designSectionTokenSummary,
  pickSectionExemplar,
} from '@continuum/contracts';
import { Handle, type NodeProps, Position, type Node as ReactFlowNode } from '@xyflow/react';
import { Gem, Loader2, Sparkles } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { useBrandDesignSections } from '@/lib/brands/useBrandDesignSections.client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import { toBackendPayload } from '../utils/buildNodePayload';
import { NodeOverlayNote, NodeTitleBar } from './NodeChrome';

const SPECIMEN_BUCKET = 'brand-docs';
const SPECIMEN_SIGNED_URL_TTL_SECONDS = 60 * 60 * 8;

/**
 * Sign one exemplar out of Storage.
 *
 * The path is `exemplarPrefix(brandId, designSystemId)` + the exemplar's own relative
 * path — the Backend spells the same prefix in `design-system/store.ts`. Returns null on
 * any failure so the caller falls to rung 2 rather than emitting a broken URL.
 */
async function signExemplar(
  brandId: string,
  designSystemId: string,
  path: string,
): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseBrowserClient()
      .storage.from(SPECIMEN_BUCKET)
      .createSignedUrl(
        `${brandId}/design-systems/${designSystemId}/${path}`,
        SPECIMEN_SIGNED_URL_TTL_SECONDS,
      );
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export function DesignRefNode({ id, data, selected }: NodeProps<ReactFlowNode<DesignRefNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const brandId = useStudioStore((state) => state.brandId);
  const { sections, snapshot, designSystemId, isLoading } = useBrandDesignSections(brandId);
  const { executeGeneration } = useWorkflowExecution();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const section = data.section ?? null;
  const mode: DesignRefMode = data.mode ?? 'both';
  const wantsImage = mode === 'image' || mode === 'both';
  const wantsText = mode === 'tokens' || mode === 'both';

  // Resolve everything the section can supply without generating: the token summary
  // always, and the specimen only when the section owns an exemplar that is an image.
  // Re-runs on section change, which is what makes switching sections re-resolve rather
  // than leave the previous section's specimen attached to the new one.
  useEffect(() => {
    if (!section || !snapshot) return;
    let cancelled = false;

    const tokenSummary = designSectionTokenSummary(snapshot, section);
    const exemplar = pickSectionExemplar(snapshot, section);

    if (!exemplar || !brandId || !designSystemId) {
      updateNodeData(id, {
        tokenSummary,
        // A section with no image exemplar keeps nothing from the section before it.
        specimenUrl: undefined,
        specimenMimeType: undefined,
        specimenSource: null,
      });
      return;
    }

    void signExemplar(brandId, designSystemId, exemplar.path).then((signedUrl) => {
      if (cancelled) return;
      updateNodeData(id, {
        tokenSummary,
        specimenUrl: signedUrl ?? undefined,
        specimenMimeType: signedUrl ? exemplar.mediaType : undefined,
        specimenSource: signedUrl ? 'exemplar' : null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [id, section, snapshot, brandId, designSystemId, updateNodeData]);

  const generateSpecimen = useCallback(async () => {
    if (!section || !brandId) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await executeGeneration(
        id,
        toBackendPayload({
          brandId,
          model: 'gemini-3.1-flash-image',
          medium: 'image',
          prompt: designRefSpecimenPrompt(snapshot, section),
          aspectRatio: '1:1',
          // The specimen is a reference plate for another generator to read, so it must
          // NOT be grounded on the design system it is depicting — the block would
          // describe the palette the plate is supposed to SHOW.
          designSystemSections: [],
          brandBookPieces: [],
        }),
      );

      const output = result.output;
      const item = output?.type === 'image' ? output : undefined;
      const url = item?.url ?? (item?.base64 ? `data:${item.mimeType};base64,${item.base64}` : '');
      if (!result.success || !url) {
        setError(result.error ?? 'The specimen did not come back.');
        return;
      }

      updateNodeData(id, {
        specimenUrl: url,
        specimenMimeType: item?.mimeType ?? 'image/png',
        specimenSource: 'generated',
        ...(item?.assetId ? { specimenAssetId: item.assetId } : {}),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsGenerating(false);
    }
  }, [brandId, executeGeneration, id, section, snapshot, updateNodeData]);

  const provenance =
    data.specimenSource === 'exemplar'
      ? 'Specimen · from your design system'
      : data.specimenSource === 'generated'
        ? 'Specimen · generated'
        : null;

  return (
    <div className="relative size-full min-h-[200px] min-w-[240px]">
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
      >
        <NodeTitleBar icon={Gem} label="Design Reference">
          {/* A native select is as wide as its widest option, and "Specimen + tokens" left
              the node's own title with 90px to render "Design Reference" in (Airtable #283). */}
          <select
            className="nodrag h-5 rounded-sm border border-border/60 bg-background px-1 text-[10px]"
            value={mode}
            aria-label="What this reference emits"
            title="What this reference emits"
            onChange={(event) => updateNodeData(id, { mode: event.target.value as DesignRefMode })}
          >
            <option value="both">Both</option>
            <option value="image">Specimen</option>
            <option value="tokens">Tokens</option>
          </select>
        </NodeTitleBar>

        {/* The controls are a strip, not a stack — one row of presets, one select. */}
        <div className="flex shrink-0 flex-col gap-1 border-b border-border/60 p-1">
          <div className="flex gap-1">
            {DESIGN_REF_PRESETS.map((preset) => (
              <Button
                key={preset.section}
                type="button"
                size="sm"
                variant={section === preset.section ? 'default' : 'outline'}
                title={preset.hint}
                className="nodrag h-6 flex-1 px-1 text-[10px]"
                onClick={() => updateNodeData(id, { section: preset.section, mode: preset.mode })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <select
            className="nodrag h-6 rounded-sm border border-border/60 bg-background px-1 text-[11px]"
            value={section ?? ''}
            aria-label="Design system section"
            onChange={(event) =>
              updateNodeData(id, {
                section: (event.target.value || null) as DesignSection | null,
              })
            }
          >
            <option value="">Choose a section…</option>
            {sections.map((row) => (
              <option key={row.section} value={row.section}>
                {DESIGN_SECTION_LABELS[row.section]}
              </option>
            ))}
          </select>
        </div>

        {/* Two BOUNDED panes stacked, never two flex siblings sharing one row: the tokens
            are prose and need their own scroll pane, and the Generate button belongs to the
            specimen — floated over the summary it clipped the text it sat on (Airtable #283,
            docs/styleguide.md §4). */}
        <NodeContent className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30 p-0">
          {wantsImage ? (
            <div className="group/preview relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              {data.specimenUrl ? (
                // biome-ignore lint/performance/noImgElement: signed storage URLs and data URLs are valid here.
                <img
                  loading="lazy"
                  src={data.specimenUrl}
                  alt={section ? `${DESIGN_SECTION_LABELS[section]} specimen` : 'Section specimen'}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="max-h-full overflow-y-auto px-3 pb-7 text-center text-2xs text-muted-foreground">
                  {!section
                    ? 'Choose a section'
                    : isLoading
                      ? 'Reading the design system…'
                      : !snapshot
                        ? 'This brand has no design system yet'
                        : 'No image in your system for this section — generate one'}
                </span>
              )}

              {data.specimenSource !== 'exemplar' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="nodrag absolute right-1.5 bottom-1.5 z-10 h-6 px-2 text-[10px] opacity-70 transition-opacity group-hover/preview:opacity-100 focus-visible:opacity-100"
                  disabled={!section || !brandId || isGenerating}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => void generateSpecimen()}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 size-3" />
                  )}
                  {data.specimenUrl ? 'Regenerate' : 'Generate'}
                </Button>
              ) : null}

              {error ? <NodeOverlayNote tone="destructive">{error}</NodeOverlayNote> : null}
              {!error && provenance ? (
                <NodeOverlayNote
                  className={cn(
                    'right-auto max-w-[60%] truncate',
                    data.specimenSource === 'exemplar' && 'text-brand-primary',
                  )}
                >
                  {provenance}
                </NodeOverlayNote>
              ) : null}
            </div>
          ) : null}

          {wantsText && data.tokenSummary ? (
            <p
              data-testid="design-ref-tokens"
              className={cn(
                'nodrag nowheel min-h-0 flex-1 overflow-y-auto p-1.5 text-left text-2xs text-muted-foreground',
                wantsImage && 'border-t border-border/60',
              )}
            >
              {data.tokenSummary.replace(/<\/?design_system>/g, '').trim()}
            </p>
          ) : null}

          {!wantsImage && error ? (
            <NodeOverlayNote tone="destructive">{error}</NodeOverlayNote>
          ) : null}
        </NodeContent>
      </CanvasNode>

      <Handle
        type="source"
        position={Position.Right}
        id={DESIGN_REF_IMAGE_OUTPUT_HANDLE}
        style={{
          top: '38%',
          ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)',
        }}
        className="studio-handle !size-3"
      />
      <Handle
        type="source"
        position={Position.Right}
        id={DESIGN_REF_TEXT_OUTPUT_HANDLE}
        style={{
          top: '62%',
          ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)',
        }}
        className="studio-handle !size-3"
      />
    </div>
  );
}
