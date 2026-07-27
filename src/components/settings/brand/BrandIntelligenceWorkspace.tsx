'use client';

import type {
  BrandBookResponse,
  BrandIntelligenceOverview,
  BrandIntelligenceScore,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Eye,
  Radar,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getBrandIntelligenceOverview,
  refreshBrandIntelligence,
} from '@/lib/brands/brandIntelligence.client';
import { cn } from '@/lib/utils';
import { BrandDnaPanel, BrandReadinessPanel, BrandSourcesPanel } from './BrandBookView';

const queryKey = (brandId: string) => ['brand-intelligence', brandId] as const;

function ScoreCard({
  score,
  icon: Icon,
}: {
  score: BrandIntelligenceScore;
  icon: typeof Activity;
}) {
  const color =
    score.band === 'strong'
      ? 'text-emerald-400'
      : score.band === 'developing'
        ? 'text-amber-300'
        : score.band === 'limited'
          ? 'text-rose-300'
          : 'text-muted-foreground';
  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="gap-3 pb-3">
        <div className="flex items-center justify-between">
          <Icon className="size-4 text-muted-foreground" />
          <span className={cn('font-mono text-2xl font-semibold tabular-nums', color)}>
            {score.value === null ? '—' : Math.round(score.value)}
          </span>
        </div>
        <div>
          <CardTitle className="text-sm">{score.label}</CardTitle>
          <CardDescription className="mt-1 text-xs leading-relaxed">
            {score.explanation}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function Lifecycle({ overview }: { overview: BrandIntelligenceOverview }) {
  const active =
    overview.enrichment.status === 'queued' || overview.enrichment.status === 'running';
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(overview.enrichment.sections).map(([section, status]) => (
        <div
          key={section}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
        >
          {status === 'ready' ? (
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          ) : (
            <CircleDashed
              className={cn('size-3.5 text-muted-foreground', active && 'animate-spin')}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-xs capitalize">
            {section.replaceAll('_', ' ')}
          </span>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{status}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceOverview({ overview }: { overview: BrandIntelligenceOverview }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>What Continuum understands</CardTitle>
          <CardDescription>
            Derived findings remain traceable to their source and evidence mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.coverage.map((item) => (
            <div
              key={item.section}
              className="flex flex-wrap items-center gap-2 border-b border-white/8 pb-3 last:border-0 last:pb-0"
            >
              <span className="flex-1 text-sm capitalize">{item.section.replaceAll('_', ' ')}</span>
              <Badge variant="outline">{item.mode}</Badge>
              <Badge variant={item.status === 'available' ? 'secondary' : 'outline'}>
                {item.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recommended next moves</CardTitle>
          <CardDescription>Prioritized from visibility and competitive evidence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.opportunities.slice(0, 4).map((opportunity) => (
            <div key={opportunity.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{opportunity.priority}</Badge>
                <p className="text-sm font-medium">{opportunity.title}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {opportunity.recommendedAction}
              </p>
            </div>
          ))}
          {overview.opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Opportunities appear as evidence sources finish enriching.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function BrandIntelligenceWorkspace({
  brandId,
  brandName,
  brandBook,
  initialOverview,
}: {
  brandId: string;
  brandName: string;
  brandBook: BrandBookResponse | null;
  initialOverview: BrandIntelligenceOverview | null;
}) {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: queryKey(brandId),
    queryFn: () => getBrandIntelligenceOverview(brandId),
    initialData: initialOverview ?? undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.enrichment.status;
      return status === 'queued' || status === 'running' ? 2_500 : false;
    },
  });
  const refresh = useMutation({
    mutationFn: () => refreshBrandIntelligence(brandId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey(brandId) });
    },
  });
  const overview = overviewQuery.data;

  if (!overview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Brand Intelligence is preparing</CardTitle>
          <CardDescription>
            The first profile is assembled in the background after onboarding. You can leave this
            page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={cn('size-4', refresh.isPending && 'animate-spin')} />
            Start enrichment
          </Button>
        </CardContent>
      </Card>
    );
  }

  const active =
    overview.enrichment.status === 'queued' || overview.enrichment.status === 'running';
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_38%),rgba(0,0,0,0.2)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center gap-2">
              <Radar className="size-4 text-indigo-300" />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-200">
                Brand Intelligence
              </span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">{brandName}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Authoritative Brand DNA, competitor context, and visibility evidence in one living
              profile. Derived findings ground the platform without rewriting your brand source.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={active ? 'secondary' : 'outline'}>
              {active ? 'Refreshing in background' : overview.enrichment.status}
            </Badge>
            <Button
              variant="outline"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending || active}
            >
              <RefreshCw
                className={cn('size-4', (refresh.isPending || active) && 'animate-spin')}
              />
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <Lifecycle overview={overview} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {overview.refreshedAt
            ? `Last good profile ${new Date(overview.refreshedAt).toLocaleString()}`
            : 'First profile is still assembling.'}
          {refresh.isError ? ' Refresh requires brand owner or admin access.' : ''}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard score={overview.scorecard.identityReadiness} icon={ShieldCheck} />
        <ScoreCard score={overview.scorecard.evidenceCoverage} icon={Activity} />
        <ScoreCard score={overview.scorecard.competitorCoverage} icon={Users} />
        <ScoreCard score={overview.scorecard.observedVisibility} icon={Eye} />
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="dna">Brand DNA</TabsTrigger>
          <TabsTrigger value="competition">Competition</TabsTrigger>
          <TabsTrigger value="visibility">Visibility</TabsTrigger>
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <EvidenceOverview overview={overview} />
        </TabsContent>
        <TabsContent value="dna">
          {brandBook?.present ? (
            <BrandDnaPanel brandBook={brandBook} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Brand DNA is still assembling from onboarding and uploaded sources.
            </p>
          )}
        </TabsContent>
        <TabsContent value="competition">
          <div className="grid gap-3 md:grid-cols-2">
            {overview.competitors.map((competitor) => (
              <Card key={`${competitor.slug}-${competitor.trackedId ?? 'candidate'}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{competitor.name}</CardTitle>
                    <Badge
                      variant={competitor.approvalStatus === 'approved' ? 'secondary' : 'outline'}
                    >
                      {competitor.approvalStatus}
                    </Badge>
                  </div>
                  <CardDescription>
                    {competitor.status === 'tracked'
                      ? competitor.identityResolved
                        ? 'Active tracking identity resolved'
                        : 'Active, identity resolution pending'
                      : 'Candidate — approval required before active tracking'}
                  </CardDescription>
                </CardHeader>
                {competitor.strategicSummary || competitor.insight ? (
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {competitor.strategicSummary ?? competitor.insight}
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="visibility">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Answer visibility estimate</CardTitle>
                <Badge variant="outline">simulated</Badge>
              </div>
              <CardDescription>
                This is not observed ChatGPT, Perplexity, or Google AI evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {overview.answerVisibility.methodology.limitations.map((limitation) => (
                <p key={limitation}>{limitation}</p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="readiness">
          {brandBook?.present ? (
            <BrandReadinessPanel brandBook={brandBook} />
          ) : (
            <p className="text-sm text-muted-foreground">Readiness is not measured yet.</p>
          )}
        </TabsContent>
        <TabsContent value="sources">
          {brandBook?.present ? <BrandSourcesPanel brandBook={brandBook} /> : null}
          <Card className="mt-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="size-4" />
                <CardTitle>Intelligence provenance</CardTitle>
              </div>
              <CardDescription>
                Source versions are retained with every materialized profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(overview.sourceVersions).map(([source, version]) => (
                <div key={source} className="flex justify-between gap-4 text-xs">
                  <span className="capitalize">{source.replaceAll('_', ' ')}</span>
                  <span className="font-mono text-muted-foreground">
                    {version ?? 'not available'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
