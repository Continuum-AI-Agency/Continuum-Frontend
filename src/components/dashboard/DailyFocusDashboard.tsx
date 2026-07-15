import type { DailyDashboardBlock, DailyDashboardDocument } from "@continuum/contracts";
import { Activity, Compass, Megaphone, Sparkles, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/state/EmptyState";
import { ModuleShortcutLink } from "@/components/shared/ModuleShortcutLink";
import { PageHeader } from "@/components/shared/PageHeader";
import { DailyDashboardThumbnail } from "./DailyDashboardThumbnail";

const actionRoutes = {
  organic_metrics: "/organic?tab=metrics",
  organic_planner: "/organic",
  scale_performance: "/scale?tab=performance",
  scale_optimizer: "/scale?tab=performance&optimizerView=portfolios",
  competitor_spy: "/competitor-spy",
} as const;

const actionLabels = {
  organic_metrics: "Open organic metrics",
  organic_planner: "Open organic planner",
  scale_performance: "Open Scale",
  scale_optimizer: "Open optimizer",
  competitor_spy: "Open Competitor Spy",
} as const;

const domainIcons = {
  paid: TrendingUp,
  organic: Activity,
  optimizer: Target,
  competitor: Compass,
  trends: Sparkles,
  system: Megaphone,
} as const;

function FocusBlock({ block, hero = false }: { block: DailyDashboardBlock; hero?: boolean }) {
  const Icon = domainIcons[block.domain];
  return (
    <Card className={hero ? "border-primary/35" : "border-border/70"}>
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="gap-1 capitalize"><Icon className="size-3" aria-hidden="true" />{block.domain}</Badge>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{Math.round(block.attentionScore)}</span>
        </div>
        <CardTitle className={hero ? "text-lg" : "text-sm"}>{block.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-3">
        {block.thumbnailUrl ? <DailyDashboardThumbnail src={block.thumbnailUrl} alt="" /> : null}
        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">{block.summary}</p>
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Why today: </span>{block.whyShown}</p>
          <ul className="space-y-1" aria-label="Evidence">
            {block.evidence.map((evidence) => <li key={`${evidence.label}:${evidence.value}`} className="text-xs text-muted-foreground">{evidence.label}: {evidence.value}</li>)}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="border-t border-border/70">
        <ModuleShortcutLink href={actionRoutes[block.actionTarget]} label={actionLabels[block.actionTarget]} />
      </CardFooter>
    </Card>
  );
}

function renderBlock(block: DailyDashboardBlock, hero: boolean) {
  switch (block.kind) {
    case "performance_insight": return <FocusBlock block={block} hero={hero} />;
    case "organic_breakout": return <FocusBlock block={block} hero={hero} />;
    case "optimizer_recommendation": return <FocusBlock block={block} hero={hero} />;
    case "competitor_breakout": return <FocusBlock block={block} hero={hero} />;
    case "trend_opportunity": return <FocusBlock block={block} hero={hero} />;
    case "quiet_day": return <FocusBlock block={block} hero={hero} />;
  }
}

export function DailyFocusDashboard({ document, generatedAt, stale }: { document: DailyDashboardDocument | null; generatedAt?: string; stale: boolean }) {
  if (!document) {
    return <EmptyState headline="Preparing today’s focus" description="Continuum is assembling a deterministic view from your persisted brand signals." media={<Sparkles className="size-5" />} />;
  }
  const hero = document.blocks.find((block) => block.slot === "hero");
  const support = document.blocks.filter((block) => block.slot !== "hero");
  const generatedLabel = generatedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: document.timezone }).format(new Date(generatedAt)) : "Preparing";
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
      <PageHeader title="Today" description={`${document.localDate} · ${generatedLabel}`} action={<Badge variant="outline" className="capitalize">{document.status}</Badge>} />
      {stale ? <Alert><AlertTitle>Refreshing today’s focus</AlertTitle><AlertDescription>The last valid snapshot stays visible while brand signals refresh in the background.</AlertDescription></Alert> : null}
      {hero ? <section aria-labelledby="today-focus-heading"><h2 id="today-focus-heading" className="sr-only">Today’s focus</h2>{renderBlock(hero, true)}</section> : null}
      {support.length > 0 ? <section aria-labelledby="supporting-focus-heading"><h2 id="supporting-focus-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Supporting signals</h2><div className="grid gap-4 md:grid-cols-2">{support.map((block) => <div key={block.id}>{renderBlock(block, false)}</div>)}</div></section> : null}
    </div>
  );
}
