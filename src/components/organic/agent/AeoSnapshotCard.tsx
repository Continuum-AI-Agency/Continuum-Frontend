'use client';

import type { AeoSnapshotCard as AeoSnapshotCardData } from '@continuum/contracts';
import { Bot, ExternalLink, Lightbulb, Search } from 'lucide-react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardSummary,
  AgentCardTitle,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function scoreTone(score: number): string {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function MetricBlock({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums', scoreTone(value))}>
        {value}
        {suffix}
      </div>
    </div>
  );
}

export function AeoSnapshotCard({ snapshot }: { snapshot: AeoSnapshotCardData }) {
  const narratives = snapshot.topNarratives.slice(0, 5);
  const citations = snapshot.citations.slice(0, 4);
  const topOpportunities = snapshot.opportunities.slice(0, 4);

  return (
    <AgentArtifactCard>
      <AgentCardHeader
        action={<StatusLabel tone="done">{snapshot.promptCount} prompts</StatusLabel>}
      >
        <AgentCardEyebrow
          label="AEO snapshot"
          right={
            <span className="text-xs text-muted-foreground">
              {formatDate(snapshot.generatedAt)}
            </span>
          }
        />
        <AgentCardTitle>How AI is representing {snapshot.brandName}</AgentCardTitle>
        <AgentCardSummary>
          Simulated answer-engine run using brand, competitor, document, trend, and
          audience-question context.
        </AgentCardSummary>
      </AgentCardHeader>

      <AgentCardBody className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-2">
          <MetricBlock label="Visibility" value={snapshot.visibilityScore} suffix="/100" />
          <MetricBlock label="Share of voice" value={snapshot.shareOfVoice} suffix="%" />
        </div>

        {narratives.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Bot className="size-3.5" />
              Top narratives
            </div>
            <div className="flex flex-wrap gap-1.5">
              {narratives.map((theme) => (
                <Badge key={theme} variant="secondary" className="rounded-md font-medium">
                  {theme}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        {snapshot.missingTopics.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Search className="size-3.5" />
              Missing topics
            </div>
            <div className="flex flex-wrap gap-1.5">
              {snapshot.missingTopics.slice(0, 5).map((topic) => (
                <Badge key={topic} variant="outline" className="rounded-md font-medium">
                  {topic}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        {citations.length > 0 ? (
          <section>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Cited/source-like domains
            </div>
            <div className="space-y-1.5">
              {citations.map((citation) => (
                <a
                  key={citation.url}
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate">{citation.title || citation.domain}</span>
                  <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    {citation.domain}
                    <ExternalLink className="size-3" />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {topOpportunities.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lightbulb className="size-3.5" />
              Recommended actions
            </div>
            <div className="space-y-2">
              {topOpportunities.map((opportunity, index) => (
                <div
                  key={opportunity.id ?? `${opportunity.title}:${index}`}
                  className="rounded-lg border border-border/50 bg-background/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="min-w-0 truncate text-sm font-medium">{opportunity.title}</h4>
                    <Badge
                      variant={opportunity.priority === 'high' ? 'default' : 'outline'}
                      className="rounded-md"
                    >
                      {opportunity.priority}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {opportunity.suggestedAction}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </AgentCardBody>
    </AgentArtifactCard>
  );
}
