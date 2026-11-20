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
import { useLocale, useTranslations } from 'next-intl';
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

/** The score figure's colour by band: the ink of the hue in light (the pale tints read 1.2-1.7:1
 *  on the light card), the pale tint the card was drawn for in dark. */
export function scoreBandColor(band: BrandIntelligenceScore['band']): string {
  if (band === 'strong') return 'text-emerald-700 dark:text-emerald-400';
  if (band === 'developing') return 'text-amber-800 dark:text-amber-300';
  if (band === 'limited') return 'text-rose-700 dark:text-rose-300';
  return 'text-muted-foreground';
}

function ScoreCard({
  score,
  icon: Icon,
}: {
  score: BrandIntelligenceScore;
  icon: typeof Activity;
}) {
  const color = scoreBandColor(score.band);
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
          <span className="font-mono text-2xs uppercase text-muted-foreground">{status}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceOverview({ overview }: { overview: BrandIntelligenceOverview }) {
  const tUi = useTranslations('settings');

  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>{tUi('m_35761c06ae')}</CardTitle>
          <CardDescription>{tUi('m_0c4c195826')}</CardDescription>
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
          <CardTitle>{tUi('m_02af6c305d')}</CardTitle>
          <CardDescription>{tUi('m_8df385c8b3')}</CardDescription>
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
            <p className="text-sm text-muted-foreground">{tUi('m_7dcd6fccd2')}</p>
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
  const uiLocale = useLocale();

  const tUi = useTranslations('settings');

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
          <CardTitle>{tUi('m_6201085235')}</CardTitle>
          <CardDescription>{tUi('m_1de91e5757')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={cn('size-4', refresh.isPending && 'animate-spin')} />
            {tUi('m_49f32ce031')}
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
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-indigo-200">
                {tUi('m_3c41409a2e')}
              </span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">{brandName}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{tUi('m_13f5dc3104')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={active ? 'secondary' : 'outline'}>
              {active ? tUi('m_4d07a54743') : overview.enrichment.status}
            </Badge>
            <Button
              variant="outline"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending || active}
            >
              <RefreshCw
                className={cn('size-4', (refresh.isPending || active) && 'animate-spin')}
              />
              {tUi('m_56e3badc4e')}
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <Lifecycle overview={overview} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {overview.refreshedAt
            ? tUi('m_a310ea2408', {
                v0: String(new Date(overview.refreshedAt).toLocaleString(uiLocale)),
              })
            : tUi('m_cd55accb58')}
          {refresh.isError ? tUi('m_445b7ede38') : ''}
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
          <TabsTrigger value="overview">{tUi('m_0efc2e6be4')}</TabsTrigger>
          <TabsTrigger value="dna">{tUi('m_087bbcc244')}</TabsTrigger>
          <TabsTrigger value="competition">{tUi('m_1917f4f0a4')}</TabsTrigger>
          <TabsTrigger value="visibility">{tUi('m_7d9ff4f0de')}</TabsTrigger>
          <TabsTrigger value="readiness">{tUi('m_6dc1222c37')}</TabsTrigger>
          <TabsTrigger value="sources">{tUi('m_2eb56be3c2')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <EvidenceOverview overview={overview} />
        </TabsContent>
        <TabsContent value="dna">
          {brandBook?.present ? (
            <BrandDnaPanel brandBook={brandBook} />
          ) : (
            <p className="text-sm text-muted-foreground">{tUi('m_1b40487401')}</p>
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
                        ? tUi('m_e804de0d79')
                        : tUi('m_ac0d67cffd')
                      : tUi('m_9f13e3537e')}
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
                <CardTitle>{tUi('m_624f51ba12')}</CardTitle>
                <Badge variant="outline">{tUi('m_c5a9119cd9')}</Badge>
              </div>
              <CardDescription>{tUi('m_cb7dde5378')}</CardDescription>
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
            <p className="text-sm text-muted-foreground">{tUi('m_e0e82604e0')}</p>
          )}
        </TabsContent>
        <TabsContent value="sources">
          {brandBook?.present ? <BrandSourcesPanel brandBook={brandBook} /> : null}
          <Card className="mt-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="size-4" />
                <CardTitle>{tUi('m_2d0c948f99')}</CardTitle>
              </div>
              <CardDescription>{tUi('m_cd455b890c')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(overview.sourceVersions).map(([source, version]) => (
                <div key={source} className="flex justify-between gap-4 text-xs">
                  <span className="capitalize">{source.replaceAll('_', ' ')}</span>
                  <span className="font-mono text-muted-foreground">
                    {version ?? tUi('m_5f23912208')}
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
