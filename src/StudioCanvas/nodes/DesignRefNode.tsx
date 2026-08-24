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
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
          <Gem className="size-3.5" />
          Design Reference
        </div>
        <NodeContent className="flex h-full flex-col gap-2 p-2">
          <div className="flex gap-1">
            {DESIGN_REF_PRESETS.map((preset) => (
              <Button
                key={preset.section}
                type="button"
                size="sm"
                variant={section === preset.section ? 'default' : 'outline'}
                title={preset.hint}
                className="nodrag h-7 flex-1 px-1 text-2xs"
                onClick={() => updateNodeData(id, { section: preset.section, mode: preset.mode })}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <select
            className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
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

          <select
            className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
            value={mode}
            aria-label="What this reference emits"
            onChange={(event) => updateNodeData(id, { mode: event.target.value as DesignRefMode })}
          >
            <option value="both">Specimen and tokens</option>
            <option value="image">Specimen only</option>
            <option value="tokens">Tokens only</option>
          </select>

          {wantsImage ? (
            <div className="flex min-h-20 flex-1 items-center justify-center overflow-hidden rounded border bg-muted/30">
              {data.specimenUrl ? (
                // biome-ignore lint/performance/noImgElement: signed storage URLs and data URLs are valid here.
                <img
                  src={data.specimenUrl}
                  alt={section ? `${DESIGN_SECTION_LABELS[section]} specimen` : 'Section specimen'}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="px-3 text-center text-2xs text-muted-foreground">
                  {!section
                    ? 'Choose a section'
                    : isLoading
                      ? 'Reading the design system…'
                      : !snapshot
                        ? 'This brand has no design system yet'
                        : 'No image in your system for this section — generate one'}
                </span>
              )}
            </div>
          ) : null}

          {wantsText && data.tokenSummary ? (
            <p className="line-clamp-2 rounded bg-muted/30 px-2 py-1 text-2xs text-muted-foreground">
              {data.tokenSummary.replace(/<\/?design_system>/g, '').trim()}
            </p>
          ) : null}

          {error ? <p className="text-2xs text-destructive">{error}</p> : null}

          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-2xs',
                data.specimenSource === 'exemplar' ? 'text-brand-primary' : 'text-muted-foreground',
              )}
            >
              {provenance ?? ''}
            </span>
            {wantsImage && data.specimenSource !== 'exemplar' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="nodrag h-7 shrink-0 px-2 text-2xs"
                disabled={!section || !brandId || isGenerating}
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
          </div>
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
