'use client';

import {
  type MediaAsset,
  type TemplateSourceSummary,
  templateNameProblem,
} from '@continuum/contracts';
import {
  AlertTriangle,
  Clock3,
  Layers,
  Loader2,
  PackageOpen,
  Send,
  Type,
  Upload,
} from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TypefaceHoldBadge } from '@/components/brand/typefaceHonesty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { parseErrorSentence } from '@/lib/library/sceneTemplates';
import {
  fetchTemplateFonts,
  sendTemplateToForge,
  type TemplateFontReadiness,
} from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';

// The Templates section: the same rows the Library already holds, shown as what they ARE
// rather than as an opaque file card. A template's useful facts are its ratios, its slots and
// its fonts, and none of them are visible on a filename.

const GRID_CLASS =
  'grid grid-cols-1 gap-[var(--app-shell-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

function PARSE_LABEL(state: TemplateSourceSummary['parseState']): {
  text: string;
  variant: 'muted' | 'success' | 'warning' | 'destructive';
} {
  const translateUi = useUiTranslations('library');

  switch (state) {
    case 'parsed':
      return { text: translateUi('read_9b9a8d05'), variant: 'success' };
    case 'pending':
      return { text: translateUi('unpacking_88332ba5'), variant: 'muted' };
    case 'unsupported':
      return { text: translateUi('not_readable_9742efc9'), variant: 'warning' };
    case 'failed':
      return { text: translateUi('couldn_t_read_3f8b4b56'), variant: 'destructive' };
  }
}

function TemplateCard({
  brandId,
  source,
  asset,
  onChanged,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  asset: MediaAsset | undefined;
  onChanged: () => void;
}) {
  const translateUi = useUiTranslations('library');

  const [fonts, setFonts] = useState<TemplateFontReadiness | null>(null);
  const [sending, setSending] = useState(false);
  const parse = source.parse;
  const name = asset?.title ?? parse?.filename ?? asset?.fileName ?? source.assetId;
  const badge = PARSE_LABEL(source.parseState);

  useEffect(() => {
    if (source.parseState !== 'parsed' || source.fonts.length === 0) return;
    let cancelled = false;
    fetchTemplateFonts(brandId, source.assetId)
      .then((result) => {
        if (!cancelled) setFonts(result);
      })
      // Advisory: a template card is still useful without the readiness check, and a failed
      // check must not make a parsed template look broken.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId, source.assetId, source.parseState, source.fonts.length]);

  const sendToForge = useCallback(async () => {
    // One naming rule, checked in the same words the Forge field uses. The render table is named
    // after this and cannot be renamed later, so a Library title that will not fit is a trip to
    // Forge — where there is a field for it — not a silent truncation.
    const problem = templateNameProblem(name);
    if (problem) {
      toast.error(
        translateUi('name_this_template_in_forge_first_v_d6292bfa', { value0: String(problem) }),
      );
      return;
    }
    setSending(true);
    try {
      const next = await sendTemplateToForge(brandId, source.assetId, name);
      toast.success(
        next.forgeState === 'stubbed'
          ? translateUi('recorded_for_template_forge_the_liv_d3c1dbf7')
          : translateUi('sent_to_template_forge_f666e34f'),
      );
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_reach_template_forge_6538842a'),
      );
    } finally {
      setSending(false);
    }
  }, [brandId, source.assetId, name, onChanged, translateUi]);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={name}>
          {name}
        </span>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>

      {source.parseState === 'parsed' ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {source.ratios.map((ratio) => (
              <Badge key={ratio} variant="secondary" className="tabular-nums">
                {ratio}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="size-3.5" />
              {translateUi('sourceSlotCount', { count: source.slotCount ?? 0 })}
            </span>
            <span className="flex items-center gap-1">
              <Type className="size-3.5" />
              {translateUi('fontCount', { count: source.fonts.length })}
            </span>
            {parse?.comps.some((comp) => comp.durationSec) ? (
              <span className="flex items-center gap-1 tabular-nums">
                <Clock3 className="size-3.5" />
                {Math.round(
                  parse.comps.find((comp) => comp.isDelivery && comp.durationSec)?.durationSec ?? 0,
                )}
                s
              </span>
            ) : null}
          </div>

          {/* The check nothing did before: a template missing a font still renders, and hands
              back a frame in a fallback face that looks exactly like success. */}
          {fonts && fonts.missing > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {fonts.missing} {translateUi('of_28391d3b')} {fonts.fonts.length}{' '}
                {translateUi('fonts_are_not_in_the_engine_renders_b55e5031')}{' '}
              </span>
            </div>
          ) : null}
          {fonts ? (
            <div className="flex flex-col gap-1">
              {fonts.fonts.map((font) => (
                <div key={font.family} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">{font.family}</span>
                  <TypefaceHoldBadge held={font.held} />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {source.parseState === 'failed'
            ? source.parseError
              ? parseErrorSentence(source.parseError)
              : translateUi('this_file_could_not_be_read_f338e18f')
            : translateUi('uploaded_and_queued_for_unpacking_r_a900bb54')}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="truncate text-2xs text-muted-foreground">
          {source.templateKey ? (
            <>
              {translateUi('published_as_e685e2bd')} {source.templateKey}
            </>
          ) : source.forgeRunId ? (
            // Never says "published": the fleet can finish a job against an unpromoted
            // package and hand back a blank frame, which reads as success.
            <>
              {translateUi('forge_8899ecd1')} {source.forgeState ?? 'queued'}
            </>
          ) : (
            <>{translateUi('not_sent_to_forge_e9ab8296')}</>
          )}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={sending || source.parseState !== 'parsed'}
          onClick={() => void sendToForge()}
        >
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}{' '}
          {translateUi('send_to_forge_27b7284f')}{' '}
        </Button>
      </div>
    </div>
  );
}

export function TemplateGrid({
  brandId,
  sources,
  assets,
  loading,
  onChanged,
  onChooseFiles,
  className,
}: {
  brandId: string;
  sources: TemplateSourceSummary[];
  assets: MediaAsset[];
  loading?: boolean;
  onChanged: () => void;
  onChooseFiles: () => void;
  className?: string;
}) {
  const translateUi = useUiTranslations('library');

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const poll = useRef({ key: '', count: 0 });
  const pendingKey = sources
    .filter((source) => source.parseState === 'pending')
    .map((source) => source.assetId)
    .sort()
    .join('|');
  useEffect(() => {
    if (!pendingKey) {
      poll.current = { key: '', count: 0 };
      return;
    }
    if (poll.current.key !== pendingKey) poll.current = { key: pendingKey, count: 0 };
    if (poll.current.count >= 40) return;
    poll.current.count += 1;
    const timer = window.setTimeout(onChanged, 3000);
    return () => window.clearTimeout(timer);
  }, [onChanged, pendingKey]);

  return (
    <div className="space-y-[var(--app-shell-gap)]">
      <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
          <PackageOpen className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            {translateUi('add_an_after_effects_template_dc4e0bf4')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {' '}
            {translateUi('drop_an_aep_aepx_aet_or_collected_z_706f2401')}{' '}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {' '}
            {translateUi('upload_865e89de')} <span aria-hidden="true">→</span>{' '}
            {translateUi('unpack_and_inspect_4b40aeb4')} <span aria-hidden="true">→</span>{' '}
            {translateUi('review_slots_71476f16')} <span aria-hidden="true">→</span>{' '}
            {translateUi('render_variants_630d4334')}{' '}
          </p>
        </div>
        <Button type="button" onClick={onChooseFiles} className="shrink-0">
          <Upload className="size-4" /> {translateUi('choose_template_43fcd78f')}{' '}
        </Button>
      </section>

      {loading && sources.length === 0 ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {translateUi(
            'loading_templates_3800ee71',
          )}{' '}
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-medium">{translateUi('no_templates_yet_2d1ae3be')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {' '}
            {translateUi('choose_a_project_above_or_drop_it_a_32412ac8')}{' '}
          </p>
        </div>
      ) : (
        <div className={cn(GRID_CLASS, className)}>
          {sources.map((source) => (
            <TemplateCard
              key={source.assetId}
              brandId={brandId}
              source={source}
              asset={byId.get(source.assetId)}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
