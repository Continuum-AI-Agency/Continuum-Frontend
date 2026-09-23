'use client';

import { EyeIcon, HelpCircleIcon, LightbulbIcon, ZapIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { InsightListBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JUDGEMENT_LABEL, JUDGEMENT_RULE, judgeValue } from '../reading';
import { BlockSourcesFooter, CitationChips } from './citations';
import { EvidenceTooltip } from './EvidenceTooltip';
import { InlineProse } from './prose';

type InsightListBlockProps = { block: InsightListBlockV2; isStreaming: boolean };

type ItemType = 'recommendation' | 'insight' | 'action' | 'question';
type Severity = 'positive' | 'neutral' | 'watch' | 'risk';
type IconComponent = ComponentType<{ className?: string }>;

const itemTypeIcon: Record<ItemType, IconComponent> = {
  recommendation: LightbulbIcon,
  insight: EyeIcon,
  action: ZapIcon,
  question: HelpCircleIcon,
};

export default function InsightListBlock({ block }: InsightListBlockProps) {
  return (
    <div>
      {block.title && (
        <div className="mb-2 flex items-center gap-1.5">
          <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
          <EvidenceTooltip
            provenance={block.provenance}
            datasetId={block.dataset_id}
            evidenceRefs={block.evidence_refs}
          />
        </div>
      )}
      <div className="space-y-2">
        {block.items.map((item, index) => {
          const Icon: IconComponent = itemTypeIcon[item.item_type as ItemType] ?? LightbulbIcon;
          // Through `reading.ts` rather than a local emerald/amber/red map: one answer to
          // "why is this rule red", and design tokens that follow the theme.
          const judgement = judgeValue(item.severity as Severity | null | undefined);

          return (
            <div
              key={index}
              className={cn(
                'rounded-lg border border-border/60 border-l-2 bg-background/80 px-3 py-2.5',
                JUDGEMENT_RULE[judgement],
              )}
              title={`${item.title}: ${JUDGEMENT_LABEL[judgement]}`}
            >
              <div className="flex items-start gap-1.5">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-foreground">
                  {item.title}
                </span>
                {item.evidence_refs?.length ? (
                  <EvidenceTooltip
                    provenance={block.provenance}
                    datasetId={block.dataset_id}
                    evidenceRefs={item.evidence_refs}
                  />
                ) : null}
                {item.priority && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-2xs uppercase tracking-wide">
                    {item.priority}
                  </span>
                )}
              </div>
              {/* The judged figure (`highlight`) takes the item's own severity tone; the
               *  entity the model set in bold takes the ink. These three used to print the
               *  raw string, so no emphasis the model wrote could ever have reached them. */}
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                <InlineProse
                  text={item.summary}
                  highlight={item.highlight}
                  severity={item.severity as Severity | null | undefined}
                />
              </div>
              {item.rationale && (
                <p className="mt-1 text-xs italic text-muted-foreground/70">
                  <InlineProse text={item.rationale} />
                </p>
              )}
              {item.impact && (
                <p className="mt-1 text-xs font-medium text-foreground/80">
                  Impact: <InlineProse text={item.impact} />
                </p>
              )}
              <CitationChips
                citeIds={item.cite_ids}
                citations={block.citations}
                className="mt-1.5"
              />
            </div>
          );
        })}
      </div>
      <BlockSourcesFooter citations={block.citations} />
    </div>
  );
}
