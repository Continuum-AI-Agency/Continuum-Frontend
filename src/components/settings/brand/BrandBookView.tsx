'use client';

// The curated Brand Book surface: one cohesive, tabbed experience over the
// materialized book. Every piece is rendered as a designed component (color
// swatches, type specimens, voice/pillar chips, a readiness scorecard) — never a
// raw key:value dump. Data shapes come from @continuum/contracts; missing pieces
// degrade to an Empty state rather than an empty card.

import type {
  BrandBookResponse,
  BrandColorToken,
  BrandFontToken,
  BrandGuidelines,
  BrandMdTokens,
  BrandReportResult,
  DocumentCategory,
  ReadinessAnalysis,
} from '@continuum/contracts';
import {
  DOCUMENT_CATEGORY_LABELS,
  deriveReadinessSummary,
  readinessBandForScore,
} from '@continuum/contracts';
import {
  AudioLines,
  Check,
  ClipboardCheck,
  Compass,
  FileText,
  FolderOpen,
  Gauge,
  Image as ImageIcon,
  ListChecks,
  Palette,
  Sparkles,
  Type,
  Users,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { BrandBookActions } from './BrandBookActions';
import { BrandMdDirtyProvider } from './BrandMdDirtyContext';
import { BrandMdEditor } from './BrandMdEditor';
import { BrandScorecard } from './BrandScorecard';
import { resolveColorTokens, resolveFontTokens } from './brandBookIdentity';

type ReadinessBadge = { label: string; variant: 'default' | 'secondary' | 'outline' };

function readinessBadge(score: number): ReadinessBadge {
  const band = readinessBandForScore(score);
  if (band === 'ready') return { label: 'Ready', variant: 'default' };
  if (band === 'developing') return { label: 'Developing', variant: 'secondary' };
  if (band === 'needs_work') return { label: 'Needs work', variant: 'outline' };
  return { label: 'Not started', variant: 'outline' };
}

function Chips({
  items,
  variant = 'secondary',
  className,
}: {
  items: readonly string[];
  variant?: 'secondary' | 'outline' | 'destructive';
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item, i) => (
        <Badge key={`${item}-${i}`} variant={variant} className="font-normal">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Palette;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function EmptyTab({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Palette;
  title: string;
  description: string;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function ColorPalette({ colors }: { colors: BrandColorToken[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {colors.map((token, i) => (
        <div key={`${token.value}-${i}`} className="overflow-hidden rounded-lg border">
          <div className="h-16 w-full" style={{ backgroundColor: token.value }} aria-hidden />
          <div className="flex flex-col gap-0.5 px-3 py-2">
            <span className="truncate text-sm font-medium">
              {token.name ?? token.role ?? 'Color'}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono uppercase">{token.value}</span>
              {token.role ? <span className="text-muted-foreground/70">· {token.role}</span> : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TypeSpecimens({ fonts }: { fonts: BrandFontToken[] }) {
  return (
    <div className="flex flex-col gap-3">
      {fonts.map((font, i) => (
        <div
          key={`${font.family}-${i}`}
          className="flex items-center gap-4 rounded-lg border px-4 py-3"
        >
          <span className="text-3xl leading-none" style={{ fontFamily: font.family }} aria-hidden>
            Ag
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium" style={{ fontFamily: font.family }}>
              {font.family}
            </span>
            <span className="text-xs text-muted-foreground">
              {font.role ? <span className="capitalize">{font.role}</span> : 'Typeface'}
              {font.note ? ` · ${font.note}` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IdentityTab({
  tokens,
  composite,
}: {
  tokens: BrandMdTokens | null;
  composite: BrandReportResult | null;
}) {
  const colors = resolveColorTokens(tokens, composite);
  const typography = resolveFontTokens(tokens, composite);
  const voice = tokens?.voice ?? null;
  const personality = tokens?.personality ?? null;
  const imagery = tokens?.imagery ?? null;
  const hasIdentity = colors.length > 0 || typography.length > 0 || voice || personality || imagery;

  if (!hasIdentity) {
    return (
      <EmptyTab
        icon={Palette}
        title="Identity is still assembling"
        description="Colors, type, and voice appear here once onboarding and the brand report finish."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {colors.length > 0 ? (
        <SectionCard
          icon={Palette}
          title="Color palette"
          description="The brand's core colors and their roles."
        >
          <ColorPalette colors={colors} />
        </SectionCard>
      ) : null}

      {typography.length > 0 ? (
        <SectionCard icon={Type} title="Typography" description="Typefaces used on creative.">
          <TypeSpecimens fonts={typography} />
        </SectionCard>
      ) : null}

      {voice ? (
        <SectionCard icon={AudioLines} title="Voice" description="How the brand sounds in copy.">
          {voice.tone ? (
            <Field label="Tone">
              <p className="text-sm">{voice.tone}</p>
            </Field>
          ) : null}
          {voice.style ? (
            <Field label="Style">
              <p className="text-sm text-muted-foreground">{voice.style}</p>
            </Field>
          ) : null}
          {voice.power_verbs.length > 0 ? (
            <Field label="Power verbs">
              <Chips items={voice.power_verbs} />
            </Field>
          ) : null}
          {voice.banned_words.length > 0 ? (
            <Field label="Avoid">
              <Chips items={voice.banned_words} variant="outline" />
            </Field>
          ) : null}
        </SectionCard>
      ) : null}

      {personality &&
      (personality.archetype ||
        personality.traits.length > 0 ||
        personality.descriptors.length > 0) ? (
        <SectionCard icon={Sparkles} title="Personality">
          {personality.archetype ? (
            <Field label="Archetype">
              <p className="text-sm">{personality.archetype}</p>
            </Field>
          ) : null}
          {personality.traits.length > 0 ? (
            <Field label="Traits">
              <Chips items={personality.traits} />
            </Field>
          ) : null}
          {personality.descriptors.length > 0 ? (
            <Field label="Descriptors">
              <Chips items={personality.descriptors} variant="outline" />
            </Field>
          ) : null}
        </SectionCard>
      ) : null}

      {imagery &&
      (imagery.creative_direction.length > 0 ||
        imagery.mood.length > 0 ||
        imagery.avoid.length > 0) ? (
        <SectionCard icon={ImageIcon} title="Imagery" description="Creative direction for visuals.">
          {imagery.creative_direction.length > 0 ? (
            <Field label="Direction">
              <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
                {imagery.creative_direction.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </Field>
          ) : null}
          {imagery.mood.length > 0 ? (
            <Field label="Mood">
              <Chips items={imagery.mood} />
            </Field>
          ) : null}
          {imagery.avoid.length > 0 ? (
            <Field label="Avoid">
              <Chips items={imagery.avoid} variant="outline" />
            </Field>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

function DoDontList({ dos, donts }: { dos: readonly string[]; donts: readonly string[] }) {
  if (dos.length === 0 && donts.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {dos.length > 0 ? (
        <Field label="Do">
          <ul className="flex flex-col gap-1.5">
            {dos.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Field>
      ) : null}
      {donts.length > 0 ? (
        <Field label="Don't">
          <ul className="flex flex-col gap-1.5">
            {donts.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <X className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Field>
      ) : null}
    </div>
  );
}

function GuidelinesCard({ guidelines }: { guidelines: BrandGuidelines }) {
  const g = guidelines.messaging_guardrails;
  const hasGuardrails =
    g.required_themes.length > 0 ||
    g.avoid_themes.length > 0 ||
    g.banned_words.length > 0 ||
    g.preferred_terms.length > 0;
  const hasAny =
    guidelines.voice_rules.dos.length > 0 ||
    guidelines.voice_rules.donts.length > 0 ||
    guidelines.content_pillars.length > 0 ||
    guidelines.tonal_rules.length > 0 ||
    hasGuardrails;
  if (!hasAny) return null;

  return (
    <SectionCard
      icon={ListChecks}
      title="Content rules"
      description="The operational guidelines every post must honor."
    >
      <DoDontList dos={guidelines.voice_rules.dos} donts={guidelines.voice_rules.donts} />

      {guidelines.content_pillars.length > 0 ? (
        <Field label="Content pillars">
          <div className="flex flex-col gap-1.5">
            {guidelines.content_pillars.map((p, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{p.pillar}</span>
                <span className="text-muted-foreground"> — {p.description}</span>
              </div>
            ))}
          </div>
        </Field>
      ) : null}

      {guidelines.tonal_rules.length > 0 ? (
        <Field label="Tone">
          <div className="flex flex-col gap-1">
            {guidelines.tonal_rules.map((t, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{t.dimension}</span>
                <span className="text-muted-foreground"> — {t.guidance}</span>
              </div>
            ))}
          </div>
        </Field>
      ) : null}

      {hasGuardrails ? (
        <>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            {g.required_themes.length > 0 ? (
              <Field label="Required themes">
                <Chips items={g.required_themes} />
              </Field>
            ) : null}
            {g.avoid_themes.length > 0 ? (
              <Field label="Avoid themes">
                <Chips items={g.avoid_themes} variant="outline" />
              </Field>
            ) : null}
            {g.preferred_terms.length > 0 ? (
              <Field label="Preferred terms">
                <Chips items={g.preferred_terms} />
              </Field>
            ) : null}
            {g.banned_words.length > 0 ? (
              <Field label="Banned words">
                <Chips items={g.banned_words} variant="destructive" />
              </Field>
            ) : null}
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}

function StrategyTab({ composite }: { composite: BrandReportResult | null }) {
  if (!composite) {
    return (
      <EmptyTab
        icon={Compass}
        title="Strategy is still assembling"
        description="Positioning, audience, and content rules appear here once the brand report finishes."
      />
    );
  }

  const understanding = composite.understanding;
  const audience = composite.structured.target_audience;
  const guidelines = composite.structured.guidelines;
  const pillars = understanding.brand_pillars ?? [];
  const segments = audience.segments ?? [];
  const audienceSummary = audience.summary ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard icon={Compass} title="Positioning" description="What the brand stands for.">
        {understanding.positioning_thesis ? (
          <p className="text-sm">{understanding.positioning_thesis}</p>
        ) : null}
        {pillars.length > 0 ? (
          <Field label="Brand pillars">
            <Chips items={pillars} />
          </Field>
        ) : null}
        {understanding.tonal_signal ? (
          <Field label="Tonal signal">
            <p className="text-sm text-muted-foreground">{understanding.tonal_signal}</p>
          </Field>
        ) : null}
      </SectionCard>

      {audienceSummary || segments.length > 0 ? (
        <SectionCard icon={Users} title="Audience" description="Who the brand is speaking to.">
          {audienceSummary ? <p className="text-sm">{audienceSummary}</p> : null}
          {segments.length > 0 ? (
            <div className="flex flex-col gap-3">
              {segments.map((seg, i) => (
                <div key={`${seg.name}-${i}`} className="rounded-lg border px-3 py-2">
                  <div className="text-sm font-medium">{seg.name}</div>
                  {seg.jtbd ? (
                    <div className="text-xs text-muted-foreground">{seg.jtbd}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {guidelines ? <GuidelinesCard guidelines={guidelines} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

function ReadinessTab({
  composite,
  readiness,
  brandId,
}: {
  composite: BrandReportResult | null;
  readiness: ReadinessAnalysis | null;
  brandId: string;
}) {
  if (!readiness) {
    return (
      <EmptyTab
        icon={Gauge}
        title="Readiness not scored yet"
        description="The 7-dimension readiness score appears once the brand report has run."
      />
    );
  }
  const summary = deriveReadinessSummary(readiness);
  return (
    <div className="flex flex-col gap-4">
      {summary.top_blocker ? (
        <Card>
          <CardHeader>
            <CardTitle>Top blocker</CardTitle>
            <CardDescription>{summary.top_blocker}</CardDescription>
          </CardHeader>
          {summary.next_action ? (
            <CardContent>
              <Field label="Next action">
                <p className="text-sm">{summary.next_action}</p>
              </Field>
            </CardContent>
          ) : null}
        </Card>
      ) : null}
      {composite ? <BrandScorecard result={{ ...composite, readiness }} brandId={brandId} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

type BookDocument = BrandBookResponse['documents'][number];

function DocumentsCard({ documents }: { documents: BookDocument[] }) {
  const byCategory = new Map<DocumentCategory, BookDocument[]>();
  for (const doc of documents) {
    const list = byCategory.get(doc.category) ?? [];
    list.push(doc);
    byCategory.set(doc.category, list);
  }
  return (
    <SectionCard
      icon={FolderOpen}
      title="Knowledge base"
      description="Documents grounding this brand."
    >
      <div className="flex flex-col gap-4">
        {[...byCategory.entries()].map(([category, docs]) => (
          <div key={category} className="flex flex-col gap-2">
            <Badge variant="outline" className="w-fit font-normal">
              {DOCUMENT_CATEGORY_LABELS[category]}
            </Badge>
            <ul className="flex flex-col gap-2">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-start gap-2 text-sm">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="flex flex-col">
                    <span>{doc.name}</span>
                    {doc.excerpt ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {doc.excerpt}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SourcesTab({
  documents,
  onboarding,
}: {
  documents: BookDocument[];
  onboarding: NonNullable<BrandBookResponse['assembled']>['onboarding'];
}) {
  const onboardingPresent = onboarding?.present ?? false;
  if (documents.length === 0 && !onboardingPresent) {
    return (
      <EmptyTab
        icon={FolderOpen}
        title="No sources yet"
        description="Upload guidelines, personas, or strategy docs under Knowledge to ground this brand."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {documents.length > 0 ? <DocumentsCard documents={documents} /> : null}
      <SectionCard
        icon={ClipboardCheck}
        title="Onboarding intake"
        description="The source interview behind this book."
      >
        <div className="flex items-center gap-2">
          <Badge variant={onboarding?.completed ? 'default' : 'secondary'}>
            {onboarding?.completed
              ? 'Completed'
              : onboardingPresent
                ? 'In progress'
                : 'Not started'}
          </Badge>
          {onboarding?.completed_at ? (
            <span className="text-xs text-muted-foreground">
              {new Date(onboarding.completed_at).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function BrandBookView({
  brandBook,
  brandName,
}: {
  brandBook: BrandBookResponse;
  brandName: string;
}) {
  const tokens = brandBook.brand_tokens ?? null;
  const composite = brandBook.composite ?? null;
  const assembled = brandBook.assembled;
  const documents = (assembled?.documents ?? brandBook.documents) as BookDocument[];
  const onboarding = assembled?.onboarding ?? null;
  const palettePreview = resolveColorTokens(tokens, composite).slice(0, 6);
  const primaryFont = resolveFontTokens(tokens, composite)[0]?.family ?? null;
  // Readiness is stored on the report layer, not always inside the composite —
  // prefer whichever is present so the score shows in both places.
  const effectiveReadiness = composite?.readiness ?? assembled?.report?.readiness ?? null;
  const overall = effectiveReadiness?.overall_score ?? null;
  const badge = overall != null ? readinessBadge(overall) : null;

  return (
    <BrandMdDirtyProvider>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-xl">{brandName}</CardTitle>
                <CardDescription>
                  Your living brand identity — one source of truth for every generation.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                <BrandBookActions brandBook={brandBook} brandName={brandName} />
              </div>
            </div>
          </CardHeader>
          {palettePreview.length > 0 || primaryFont ? (
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                {palettePreview.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    {palettePreview.map((c, i) => (
                      <span
                        key={`${c.value}-${i}`}
                        role="img"
                        className="size-6 rounded-full border"
                        style={{ backgroundColor: c.value }}
                        title={c.name ?? c.value}
                        aria-label={c.name ?? c.value}
                      />
                    ))}
                  </div>
                ) : null}
                {primaryFont ? (
                  <span
                    className="text-sm text-muted-foreground"
                    style={{ fontFamily: primaryFont }}
                  >
                    {primaryFont}
                  </span>
                ) : null}
                {brandBook.refreshed_at ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Updated {new Date(brandBook.refreshed_at).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
            </CardContent>
          ) : null}
        </Card>

        <Tabs defaultValue="identity" className="gap-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="identity">Identity</TabsTrigger>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
            <TabsTrigger value="readiness">Readiness</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="document">Document</TabsTrigger>
          </TabsList>

          <TabsContent value="identity">
            <IdentityTab tokens={tokens} composite={composite} />
          </TabsContent>
          <TabsContent value="strategy">
            <StrategyTab composite={composite} />
          </TabsContent>
          <TabsContent value="readiness">
            <ReadinessTab
              composite={composite}
              readiness={effectiveReadiness}
              brandId={brandBook.brand_id}
            />
          </TabsContent>
          <TabsContent value="sources">
            <SourcesTab documents={documents} onboarding={onboarding} />
          </TabsContent>
          <TabsContent value="document">
            <SectionCard
              icon={FileText}
              title="Brand document"
              description="The editable master brand.md. Powers the views above."
            >
              <BrandMdEditor
                brandId={brandBook.brand_id}
                initialBrandMd={brandBook.brand_md}
                isEdited={brandBook.brand_md_is_edited}
              />
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </BrandMdDirtyProvider>
  );
}

export function BrandDnaPanel({ brandBook }: { brandBook: BrandBookResponse }) {
  const composite = brandBook.composite ?? null;
  const tokens = brandBook.brand_tokens ?? null;
  return (
    <BrandMdDirtyProvider>
      <div className="flex flex-col gap-4">
        <IdentityTab tokens={tokens} composite={composite} />
        <StrategyTab composite={composite} />
        <SectionCard
          icon={FileText}
          title="Authoritative brand document"
          description="Edit the brand.md source agents must follow. Derived intelligence never overwrites it."
        >
          <BrandMdEditor
            brandId={brandBook.brand_id}
            initialBrandMd={brandBook.brand_md}
            isEdited={brandBook.brand_md_is_edited}
          />
        </SectionCard>
      </div>
    </BrandMdDirtyProvider>
  );
}

export function BrandReadinessPanel({ brandBook }: { brandBook: BrandBookResponse }) {
  const composite = brandBook.composite ?? null;
  const readiness = composite?.readiness ?? brandBook.assembled?.report?.readiness ?? null;
  return <ReadinessTab composite={composite} readiness={readiness} brandId={brandBook.brand_id} />;
}

export function BrandSourcesPanel({ brandBook }: { brandBook: BrandBookResponse }) {
  const documents = (brandBook.assembled?.documents ?? brandBook.documents) as BookDocument[];
  return <SourcesTab documents={documents} onboarding={brandBook.assembled?.onboarding ?? null} />;
}
