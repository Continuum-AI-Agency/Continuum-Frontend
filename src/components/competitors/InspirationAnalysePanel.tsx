'use client';

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
import Link from 'next/link';
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
  not_analysed: 'Analyse the post first.',
  inspiration_seed_unresolved:
    'This post could not be found to build from. Save it to your Library and try again.',
};

function errorText(error: unknown): string {
  if (error instanceof ApiError) return ACT_ERRORS[error.code ?? error.message] ?? error.message;
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

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
  if (analysis.video) {
    const transcript = analysis.video.transcript.trim();
    return transcript ? (
      <p data-testid="analysis-transcript" className="whitespace-pre-line text-sm leading-relaxed">
        {transcript}
      </p>
    ) : (
      <Empty>No speech in this video ({analysis.video.audio_kind.replace('_', ' ')}).</Empty>
    );
  }
  const onScreen = analysis.image?.on_screen_text ?? null;
  if (onScreen) return <Field label="On-image text">{onScreen}</Field>;
  if (analysis.carousel) {
    return (
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed">
        {analysis.carousel.slide_summaries.map((summary, index) => (
          <li key={index}>{summary}</li>
        ))}
      </ol>
    );
  }
  return <Empty>No spoken or written copy on this post.</Empty>;
}

function IdeaTab({ analysis }: { analysis: CompetitorPostAnalysis }) {
  const { idea } = analysis;
  if (!idea) {
    return (
      <Empty>
        {analysis.idea_error
          ? `The idea breakdown failed: ${analysis.idea_error}`
          : 'No idea breakdown yet. Re-analyse to generate one.'}
      </Empty>
    );
  }
  return (
    <div data-testid="analysis-idea" className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{idea.topic}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{idea.industry}</span>
      </div>
      <Field label="Idea seed">
        <span data-testid="idea-seed">{idea.ideaSeed}</span>
      </Field>
      <Field label="Unique angle">{idea.uniqueAngle}</Field>
      <Field label="Common belief it challenges">{idea.commonBeliefChallenged}</Field>
      <Field label="Contrarian reality">
        <span data-testid="idea-contrarian-reality">{idea.contrarianReality}</span>
      </Field>
      <Field label="Supporting evidence">
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
  const firstSeconds = analysis.video?.hook_first_3s ?? null;
  const visualHook =
    analysis.video?.visual_hook ??
    analysis.image?.visual_hook ??
    analysis.carousel?.visual_hook ??
    null;
  if (!firstSeconds && !visualHook) return <Empty>No hook was read from this post.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      {firstSeconds ? (
        <Field label="First 3 seconds">
          <span data-testid="analysis-hook">{firstSeconds}</span>
        </Field>
      ) : null}
      {visualHook ? (
        <Field label={firstSeconds ? 'Visual hook' : 'Hook'}>
          <span data-testid={firstSeconds ? undefined : 'analysis-hook'}>{visualHook}</span>
        </Field>
      ) : null}
    </div>
  );
}

function VisualsTab({ analysis }: { analysis: CompetitorPostAnalysis }) {
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
      <Empty>No scene beats were read from this video.</Empty>
    );
  }
  if (analysis.image) {
    const { image } = analysis;
    return (
      <div className="flex flex-col gap-4">
        <Field label="Scene">{image.scene}</Field>
        <Field label="Subjects">{image.subjects.join(', ') || '–'}</Field>
        <Field label="Mood">{image.mood}</Field>
        <Field label="Palette">{image.color_palette.join(', ') || '–'}</Field>
      </div>
    );
  }
  if (analysis.carousel) {
    return (
      <Field label={`Narrative across ${analysis.carousel.slide_count} slides`}>
        {analysis.carousel.narrative_arc}
      </Field>
    );
  }
  return <Empty>No visual read on this post.</Empty>;
}

function WhyItWorked({ view }: { view: CompetitorPostView }) {
  const why = view.whyItWorked;
  if (!why) return null;
  return (
    <section
      data-testid="why-it-worked"
      className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3"
      aria-labelledby="why-it-worked-heading"
    >
      <h3 id="why-it-worked-heading" className="text-xs font-semibold">
        Why it worked
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
  const { post } = view;
  const alt = `${view.competitorName} ${post.kind}`;
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
        className="max-h-[42vh] object-contain"
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
  const { analysis } = view;
  if (!analysis || !isDescribedCompetitorPostAnalysis(analysis)) {
    const reason = analysis?.error ?? analysis?.skip_reason ?? null;
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">
          {analysis
            ? `The last analysis did not finish${reason ? `: ${reason}` : '.'}`
            : 'Not analysed yet. Analysis reads the transcript, hook, scene beats and the idea behind the post.'}
        </p>
        <Button size="sm" onClick={onAnalyse} disabled={analysing}>
          <Sparkles data-icon="inline-start" />
          {analysing ? 'Analysing…' : analysis ? 'Try again' : 'Analyse'}
        </Button>
        {analyseError ? (
          <p className="text-xs text-destructive">{errorText(analyseError)}</p>
        ) : null}
      </div>
    );
  }
  return (
    <Tabs defaultValue="transcript" className="gap-3">
      <TabsList variant="line">
        <TabsTrigger value="transcript">Transcript</TabsTrigger>
        <TabsTrigger value="idea">Idea</TabsTrigger>
        <TabsTrigger value="hook">Hook</TabsTrigger>
        <TabsTrigger value="visuals">Visuals</TabsTrigger>
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
        Draft ready: open in planner
        <ArrowRight data-icon="inline-end" />
      </Link>
    );
  }

  if (!expanded) {
    return (
      <Button size="sm" onClick={() => setExpanded(true)}>
        Develop into draft
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
        What should your version say? <span className="text-muted-foreground">(optional)</span>
      </label>
      <Textarea
        id={`develop-note-${postId}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder="e.g. Same hook, but about our rooftop amenities"
        disabled={develop.isPending}
      />
      <div className="flex items-center justify-end gap-2">
        {develop.isError ? (
          <p className="mr-auto text-xs text-destructive">{errorText(develop.error)}</p>
        ) : null}
        {develop.isPending ? (
          <p className="mr-auto text-xs text-muted-foreground" aria-live="polite">
            Creating your draft. This takes up to a minute.
          </p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
          disabled={develop.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={develop.isPending}>
          {develop.isPending ? 'Creating…' : 'Create draft'}
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
  const save = useSaveInspirationTemplate(brandId);
  if (save.data) {
    return (
      <p data-testid="template-saved" data-skill-id={save.data.id} className="text-xs">
        Saved as template <span className="font-medium">{save.data.name}</span>
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {save.isError ? <p className="text-xs text-destructive">{errorText(save.error)}</p> : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() => run(() => save.mutate(postId))}
        disabled={!analysed || save.isPending}
        title={analysed ? undefined : 'Analyse the post first'}
      >
        <LibraryBig data-icon="inline-start" />
        {save.isPending ? 'Saving…' : 'Save as template'}
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
            {post.timestamp ? <span>· {formatRelativeTime(post.timestamp)}</span> : null}
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Open on Instagram
            </a>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-lg bg-black">
            <PanelMedia view={live} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {COMPETITOR_POST_FORMAT_LABELS[live.format]}
            </span>
            <OutlierBadge view={live} className="text-xs" />
            <PostMetrics view={live} className="text-xs" />
          </div>

          {live.relevance && live.relevance.matchedTerms.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Matches your brand on {live.relevance.matchedTerms.join(', ')}
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
                  {analyse.isPending ? 'Analysing…' : 'Re-analyse'}
                </Button>
              ) : null}
              {actions}
            </div>
            <SaveAsTemplate brandId={brandId} postId={post.id} analysed={analysed} run={run} />
          </div>
          {prepare.isError ? (
            <p className="text-xs text-destructive">
              Could not save this post to your Library first: {errorText(prepare.error)}
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
