'use client';

import { EyeIcon, HelpCircleIcon, LightbulbIcon, ZapIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { InsightListBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JAINA_TYPE, JUDGEMENT_LABEL, JUDGEMENT_TEXT, judgeValue } from '../reading';
import { BlockHeading } from './BlockHeading';
import { BlockSourcesFooter, CitationChips } from './citations';
import { EvidenceTooltip } from './EvidenceTooltip';
import { JAINA_MODULE } from './modules';
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
  // One neutral module; the items inside are separated by space, never by a rule or a card.
  return (
    <div className={JAINA_MODULE.neutral} data-jaina-module="block">
      {block.title && (
        <BlockHeading
          title={block.title}
          provenance={block.provenance}
          datasetId={block.dataset_id}
          evidenceRefs={block.evidence_refs}
        />
      )}
      <div className="space-y-3">
        {block.items.map((item, index) => {
          const Icon: IconComponent = itemTypeIcon[item.item_type as ItemType] ?? LightbulbIcon;
          // Through `reading.ts` rather than a local emerald/amber/red map: one answer to
          // "why is this item red", and design tokens that follow the theme. The judgement
          // colours the item's icon; the item itself draws no rule.
          const judgement = judgeValue(item.severity as Severity | null | undefined);

          return (
            <div
              key={index}
              data-judgement={judgement}
              title={`${item.title}: ${JUDGEMENT_LABEL[judgement]}`}
            >
              <div className="flex items-start gap-1.5">
                <Icon className={cn('mt-1 size-3.5 shrink-0', JUDGEMENT_TEXT[judgement])} />
                <span className={cn('min-w-0 flex-1 font-medium text-foreground', JAINA_TYPE.body)}>
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
                  <span
                    className={cn(
                      'shrink-0 rounded-full bg-background/80 px-1.5 py-0.5',
                      JAINA_TYPE.label,
                    )}
                  >
                    {item.priority}
                  </span>
                )}
              </div>
              {/* The judged figure (`highlight`) takes the item's own severity tone; the
               *  entity the model set in bold takes the ink. These three used to print the
               *  raw string, so no emphasis the model wrote could ever have reached them. */}
              <div className={cn('mt-1 leading-5 text-muted-foreground', JAINA_TYPE.table)}>
                <InlineProse
                  text={item.summary}
                  highlight={item.highlight}
                  severity={item.severity as Severity | null | undefined}
                />
              </div>
              {item.rationale && (
                <p className={cn('mt-1 italic text-muted-foreground/70', JAINA_TYPE.table)}>
                  <InlineProse text={item.rationale} />
                </p>
              )}
              {item.impact && (
                <p className={cn('mt-1 font-medium text-foreground/80', JAINA_TYPE.table)}>
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
