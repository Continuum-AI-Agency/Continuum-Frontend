'use client';
import { COMPETITOR_INSPIRATION_ERROR_CODES } from '@continuum/contracts';

import { useLocale, useTranslations } from 'next-intl';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { useUiErrorMessage } from '@/i18n/errors';
import { competitorErrorCopy } from './competitorErrorCopy';

// The Analyse panel for one Inspiration post, opened beside the grid so the
// grid stays in view. It shows the post, the describer's read of it (Transcript /
// Idea / Hook / Visuals), the Backend's deterministic "Why it worked", and the two
// actions that turn a post into our own work: Develop into draft (an organic
// draft seeded by this post) and Save as template (a brand skill built from its
// structure). Every value comes from the Backend: nothing is inferred here.

import {
  COMPETITOR_POST_FORMAT_LABELS,
  type CompetitorPostAnalysis,
  isDescribedCompetitorPostAnalysis,
} from '@continuum/contracts';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, ExternalLink, LibraryBig, RotateCw, Sparkles } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import {
  useAnalyseInspirationPost,
  useDevelopInspirationPost,
  useSaveCompetitorPostToLibrary,
  useSavedCompetitorPostIds,
  useSaveInspirationTemplate,
} from '@/lib/api/competitorSpy';
import { ApiError } from '@/lib/api/errors';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { type CompetitorPostView, carouselSlides } from './competitorPostView';
import { PostCarousel, PostThumb, ReelVideo, reelVideoUrl } from './postMedia';
import { OutlierBadge, PostMetrics } from './postStats';

// The act routes answer 409 with a machine code in `error`; ApiError carries it as
// the message when the payload has no `message`.
const ACT_ERRORS: Record<string, string> = {
  [COMPETITOR_INSPIRATION_ERROR_CODES.notAnalysed]: 'Analyse the post first.',
  [COMPETITOR_INSPIRATION_ERROR_CODES.seedUnresolved]:
    'This post could not be found to build from. Save it to your Library and try again.',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function TranscriptTab({ analysis }: { analysis: CompetitorPostAnalysis }) {
  const uiText = useTranslations('competitor');

  if (analysis.video) {
    const transcript = analysis.video.transcript.trim();
    return transcript ? (
      <p data-testid="analysis-transcript" className="whitespace-pre-line text-sm leading-relaxed">
        {transcript}
      </p>
    ) : (
      <Empty>
        {uiText.rich('sentence_93b17ac53f0b', {
          v0: () =>
            localizeCompetitorCopy(
              (
                {
                  voiceover: 'Voiceover',
                  dialogue: 'Dialogue',
                  music_only: 'Music only',
                  ambient: 'Ambient',
                  silent: 'Silent',
                  unknown: 'Unknown',
                } as const
              )[analysis.video?.audio_kind ?? 'unknown'],
              uiText,
            ),
        })}
      </Empty>
    );
  }
  const onScreen = analysis.image?.on_screen_text ?? null;
  if (onScreen) return <Field label={uiText('on_image_text_0c39f51')}>{onScreen}</Field>;
  if (analysis.carousel) {
    return (
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed">
        {analysis.carousel.slide_summaries.map((summary, index) => (
          <li key={index}>{summary}</li>
        ))}
      </ol>
    );
  }
  return <Empty>{uiText('no_spoken_or_written_copy_on_this_post_d8f1026')}</Empty>;
}

function IdeaTab({ analysis }: { analysis: CompetitorPostAnalysis }) {
  const uiText = useTranslations('competitor');

  const { idea } = analysis;
  if (!idea) {
    return (
      <Empty>
        {analysis.idea_error
          ? uiText('m_685537e1f5')
          : uiText('no_idea_breakdown_yet_re_analyse_to_generate__53761a5')}
      </Empty>
    );
  }
  return (
    <div data-testid="analysis-idea" className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{idea.topic}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{idea.industry}</span>
      </div>
      <Field label={uiText('idea_seed_f86bd13')}>
        <span data-testid="idea-seed">{idea.ideaSeed}</span>
      </Field>
      <Field label={uiText('unique_angle_c82d6a5')}>{idea.uniqueAngle}</Field>
      <Field label={uiText('common_belief_it_challenges_55d6ea5')}>
        {idea.commonBeliefChallenged}
      </Field>
      <Field label={uiText('contrarian_reality_210afe9')}>
        <span data-testid="idea-contrarian-reality">{idea.contrarianReality}</span>
      </Field>
      <Field label={uiText('supporting_evidence_fb06dfa')}>
        <ul data-testid="idea-supporting-evidence" className="flex list-disc flex-col gap-1 pl-5">
          {idea.supportingEvidence.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Field>
    </div>
  );
}

function HookTab({ analysis }: { analysis: CompetitorPostAnalysis }) {
  const uiText = useTranslations('competitor');

  const firstSeconds = analysis.video?.hook_first_3s ?? null;
  const visualHook =
    analysis.video?.visual_hook ??
    analysis.image?.visual_hook ??
    analysis.carousel?.visual_hook ??
    null;
  if (!firstSeconds && !visualHook)
    return <Empty>{uiText('no_hook_was_read_from_this_post_4f76813')}</Empty>;
  return (
    <div className="flex flex-col gap-4">
      {firstSeconds ? (
        <Field label={uiText('first_3_seconds_8eaee90')}>
          <span data-testid="analysis-hook">{firstSeconds}</span>
        </Field>
      ) : null}
      {visualHook ? (
        <Field label={firstSeconds ? uiText('visual_hook_fe0854b') : uiText('hook_536ff50')}>
          <span data-testid={firstSeconds ? undefined : 'analysis-hook'}>{visualHook}</span>
        </Field>
      ) : null}
    </div>
  );
}

function VisualsTab({ analysis }: { analysis: CompetitorPostAnalysis }) {
  const uiText = useTranslations('competitor');

  if (analysis.video) {
    return analysis.video.scene_beats.length > 0 ? (
      <ol data-testid="analysis-beats" className="flex flex-col gap-2">
        {analysis.video.scene_beats.map((beat, index) => (
          <li key={index} className="flex gap-3 text-sm leading-relaxed">
            <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatSeconds(beat.t_seconds)}
            </span>
            <span>{beat.description}</span>
          </li>
        ))}
      </ol>
    ) : (
      <Empty>{uiText('no_scene_beats_were_read_from_this_video_818293a')}</Empty>
    );
  }
  if (analysis.image) {
    const { image } = analysis;
    return (
      <div className="flex flex-col gap-4">
        <Field label={uiText('scene_477e5af')}>{image.scene}</Field>
        <Field label={uiText('subjects_1a7529a')}>{image.subjects.join(', ') || '–'}</Field>
        <Field label={uiText('mood_780fe43')}>{image.mood}</Field>
        <Field label={uiText('palette_85794ef')}>{image.color_palette.join(', ') || '–'}</Field>
      </div>
    );
  }
  if (analysis.carousel) {
    return (
      <Field label={uiText('m_dee6714562', { count: analysis.carousel.slide_count })}>
        {analysis.carousel.narrative_arc}
      </Field>
    );
  }
  return <Empty>{uiText('no_visual_read_on_this_post_3541091')}</Empty>;
}

function WhyItWorked({ view }: { view: CompetitorPostView }) {
  const uiText = useTranslations('competitor');

  const why = view.whyItWorked;
  if (!why) return null;
  return (
    <section
      data-testid="why-it-worked"
      className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3"
      aria-labelledby="why-it-worked-heading"
    >
      <h3 id="why-it-worked-heading" className="text-xs font-semibold">
        {uiText('why_it_worked_c5de6f7')}
      </h3>
      <p className="text-sm leading-relaxed">{why.whyItWorked}</p>
      {why.reasons.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {why.reasons.map((reason, index) => (
            <li key={index} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="w-10 shrink-0 font-medium capitalize text-foreground/70">
                {reason.cites}
              </span>
              <span>{reason.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PanelMedia({ view }: { view: CompetitorPostView }) {
  const uiText = useTranslations('competitor');
  const { post } = view;
  const alt = `${view.competitorName} ${localizeCompetitorCopy(post.kind === 'carousel' ? 'Carousel' : post.kind === 'reel' ? 'Reel' : 'Post', uiText)}`;
  const slides = carouselSlides(post);
  const videoUrl = reelVideoUrl(post);
  if (slides.length > 0) return <PostCarousel slides={slides} poster={post.coverUrl} alt={alt} />;
  if (videoUrl) {
    return (
      <ReelVideo
        src={videoUrl}
        poster={post.coverUrl}
        alt={alt}
        autoPlay
        controls
        className="aspect-auto! h-auto max-h-[42vh] w-full rounded-lg border-0 [&_video]:h-auto [&_video]:max-h-[42vh] [&_video]:object-contain"
      />
    );
  }
  return <PostThumb coverUrl={post.coverUrl} alt={alt} className="max-h-[42vh] object-contain" />;
}

function AnalysisBody({
  view,
  onAnalyse,
  analysing,
  analyseError,
}: {
  view: CompetitorPostView;
  onAnalyse: () => void;
  analysing: boolean;
  analyseError: unknown;
}) {
  const uiText = useTranslations('competitor');
  const formatUiError = useUiErrorMessage();
  const { analysis } = view;
  if (!analysis || !isDescribedCompetitorPostAnalysis(analysis)) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">
          {analysis
            ? uiText('m_8adf18a77f')
            : uiText('not_analysed_yet_analysis_reads_the_transcrip_ae8af42')}
        </p>
        <Button size="sm" onClick={onAnalyse} disabled={analysing}>
          <Sparkles data-icon="inline-start" />
          {analysing
            ? uiText('analysing_095f293')
            : analysis
              ? uiText('try_again_d8b8392')
              : uiText('analyse_d8673f9')}
        </Button>
        {analyseError ? (
          <p className="text-xs text-destructive">
            {competitorErrorCopy(analyseError, ACT_ERRORS, uiText, formatUiError)}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <Tabs defaultValue="transcript" className="gap-3">
      <TabsList variant="line">
        <TabsTrigger value="transcript">{uiText('transcript_721164f')}</TabsTrigger>
        <TabsTrigger value="idea">{uiText('idea_b202bcb')}</TabsTrigger>
        <TabsTrigger value="hook">{uiText('hook_536ff50')}</TabsTrigger>
        <TabsTrigger value="visuals">{uiText('visuals_3d609a2')}</TabsTrigger>
      </TabsList>
      <TabsContent value="transcript">
        <TranscriptTab analysis={analysis} />
      </TabsContent>
      <TabsContent value="idea">
        <IdeaTab analysis={analysis} />
      </TabsContent>
      <TabsContent value="hook">
        <HookTab analysis={analysis} />
      </TabsContent>
      <TabsContent value="visuals">
        <VisualsTab analysis={analysis} />
      </TabsContent>
    </Tabs>
  );
}

type Run = (act: () => void) => void;

function DevelopIntoDraft({ brandId, postId, run }: { brandId: string; postId: string; run: Run }) {
  const uiText = useTranslations('competitor');
  const formatUiError = useUiErrorMessage();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const develop = useDevelopInspirationPost(brandId);

  if (develop.data) {
    return (
      <Link
        data-testid="develop-draft-link"
        data-draft-id={develop.data.draftId}
        href={`/open/planner?brandId=${encodeURIComponent(brandId)}&draftId=${encodeURIComponent(develop.data.draftId)}`}
        className={buttonVariants({ size: 'sm' })}
      >
        {uiText('draft_ready_open_in_planner_0a2e0c6')}
        <ArrowRight data-icon="inline-end" />
      </Link>
    );
  }

  if (!expanded) {
    return (
      <Button size="sm" onClick={() => setExpanded(true)}>
        {uiText('develop_into_draft_04b7df4')}
        <ArrowRight data-icon="inline-end" />
      </Button>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => develop.mutate({ postId, note: note.trim() || null }));
      }}
    >
      <label htmlFor={`develop-note-${postId}`} className="text-xs font-medium">
        {uiText('m_6ccbcb9a76')}
        <span className="text-muted-foreground">{uiText('optional_0059798')}</span>
      </label>
      <Textarea
        id={`develop-note-${postId}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder={uiText('e_g_same_hook_but_about_our_rooftop_amenities_cdf5e07')}
        disabled={develop.isPending}
      />
      <div className="flex items-center justify-end gap-2">
        {develop.isError ? (
          <p className="mr-auto text-xs text-destructive">
            {competitorErrorCopy(develop.error, ACT_ERRORS, uiText, formatUiError)}
          </p>
        ) : null}
        {develop.isPending ? (
          <p className="mr-auto text-xs text-muted-foreground" aria-live="polite">
            {uiText('creating_your_draft_this_takes_up_to_a_minute_9074221')}
          </p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
          disabled={develop.isPending}
        >
          {uiText('cancel_19766ed')}
        </Button>
        <Button type="submit" size="sm" disabled={develop.isPending}>
          {develop.isPending ? uiText('creating_c79ed94') : uiText('create_draft_07d07af')}
        </Button>
      </div>
    </form>
  );
}

function SaveAsTemplate({
  brandId,
  postId,
  analysed,
  run,
}: {
  brandId: string;
  postId: string;
  analysed: boolean;
  run: Run;
}) {
  const uiText = useTranslations('competitor');
  const formatUiError = useUiErrorMessage();
  const save = useSaveInspirationTemplate(brandId);
  if (save.data) {
    return (
      <p data-testid="template-saved" data-skill-id={save.data.id} className="text-xs">
        {uiText('m_7ced64f610')}
        <span className="font-medium">{save.data.name}</span>
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {save.isError ? (
        <p className="text-xs text-destructive">
          {competitorErrorCopy(save.error, ACT_ERRORS, uiText, formatUiError)}
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() => run(() => save.mutate(postId))}
        disabled={!analysed || save.isPending}
        title={analysed ? undefined : uiText('analyse_the_post_first_77cf161')}
      >
        <LibraryBig data-icon="inline-start" />
        {save.isPending ? uiText('saving_23e3929') : uiText('save_as_template_c4fcbe6')}
      </Button>
    </div>
  );
}

export function InspirationAnalysePanel({
  brandId,
  view,
  open,
  onOpenChange,
  actions,
}: {
  brandId: string;
  view: CompetitorPostView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: ReactNode;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  const formatUiError = useUiErrorMessage();
  const analyse = useAnalyseInspirationPost(brandId);
  const { data: savedIds } = useSavedCompetitorPostIds(brandId);
  const saveToLibrary = useSaveCompetitorPostToLibrary(brandId);
  // The act routes find a post by id among tracked or saved posts. A handle-search
  // result is neither until it is saved, so it is saved to the Library first.
  const resolvable = view.competitorId !== null || (savedIds?.has(view.post.id) ?? false);
  const prepare = useMutation({
    mutationFn: async () => {
      if (resolvable) return;
      await saveToLibrary.mutateAsync({
        brandId,
        competitorId: null,
        competitorName: view.competitorName,
        instagramUsername: view.instagramUsername,
        post: view.post,
      });
    },
  });
  const run: Run = (act) => prepare.mutate(undefined, { onSuccess: act });
  // Search results live in no cached list, so the panel keeps its own copy of the
  // freshly analysed post; tracked and saved posts also update in their lists.
  const live: CompetitorPostView = analyse.data
    ? {
        ...view,
        format: analyse.data.format,
        analysis: analyse.data.analysis,
        whyItWorked: analyse.data.whyItWorked,
      }
    : view;
  const { post } = live;
  const analysed = isDescribedCompetitorPostAnalysis(live.analysis);
  const runAnalyse = () => run(() => analyse.mutate(post.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="inspiration-analyse-panel"
        className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="truncate pr-8">{live.competitorName}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2">
            <span>@{live.instagramUsername}</span>
            {post.timestamp ? (
              <span>· {formatRelativeTime(post.timestamp, undefined, uiLocale)}</span>
            ) : null}
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {uiText('open_on_instagram_f0672e7')}
            </a>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-lg bg-black">
            <PanelMedia view={live} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {localizeCompetitorCopy(COMPETITOR_POST_FORMAT_LABELS[live.format], uiText)}
            </span>
            <OutlierBadge view={live} className="text-xs" />
            <PostMetrics view={live} className="text-xs" />
          </div>

          {live.relevance && live.relevance.matchedTerms.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {uiText.rich('sentence_e8cf26cb032c', {
                v0: () => live.relevance?.matchedTerms.join(', '),
              })}
            </p>
          ) : null}

          {post.caption ? (
            <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {post.caption}
            </p>
          ) : null}

          <WhyItWorked view={live} />

          <AnalysisBody
            view={live}
            onAnalyse={runAnalyse}
            analysing={analyse.isPending || prepare.isPending}
            analyseError={analyse.error}
          />
        </div>

        <SheetFooter className="flex-col gap-3 border-t border-border sm:flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {analysed ? (
                <Button variant="ghost" size="sm" onClick={runAnalyse} disabled={analyse.isPending}>
                  <RotateCw
                    data-icon="inline-start"
                    className={cn(analyse.isPending && 'animate-spin')}
                  />
                  {analyse.isPending ? uiText('analysing_095f293') : uiText('re_analyse_6535090')}
                </Button>
              ) : null}
              {actions}
            </div>
            <SaveAsTemplate brandId={brandId} postId={post.id} analysed={analysed} run={run} />
          </div>
          {prepare.isError ? (
            <p className="text-xs text-destructive">
              {uiText.rich('sentence_cb1cc7156aa0', {
                v0: () => competitorErrorCopy(prepare.error, ACT_ERRORS, uiText, formatUiError),
              })}
            </p>
          ) : null}
          <div className="flex justify-end">
            <DevelopIntoDraft brandId={brandId} postId={post.id} run={run} />
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
