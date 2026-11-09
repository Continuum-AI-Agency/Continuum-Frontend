'use client';

// The "while you were away" card at the top of a chat thread: how long you were gone, then what
// needs you, what failed and what is done, one action per row. Got it folds the card into a
// divider marker that opens it again.

import { History } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
} from '@/components/shared/agent-cards/agentCardKit';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { RECAP_TONE } from './AgentRecap';
import { formatAway, groupRecap, RECAP_TONES, type RecapItem } from './model';

const swap = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: 'easeOut' },
} as const;

export function AwaySummary({
  since,
  now,
  items,
  onAction,
  onDismiss,
  className,
}: {
  since: number;
  now: number;
  items: RecapItem[];
  onAction?: (item: RecapItem) => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const [folded, setFolded] = useState(false);
  const groups = groupRecap(items);
  const rows = RECAP_TONES.flatMap((tone) => groups[tone]);
  const tally = RECAP_TONES.filter((tone) => groups[tone].length > 0)
    .map((tone) => `${groups[tone].length} ${RECAP_TONE[tone].label.toLowerCase()}`)
    .join(' · ');

  if (rows.length === 0) return null;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        {folded ? (
          <motion.div key="marker" {...swap} className={className}>
            <Marker variant="separator" asChild>
              <button
                type="button"
                onClick={() => setFolded(false)}
                className="cursor-pointer rounded-sm text-2xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MarkerIcon>
                  <History className="size-3.5" />
                </MarkerIcon>
                <MarkerContent>While you were away · {tally}</MarkerContent>
              </button>
            </Marker>
          </motion.div>
        ) : (
          <motion.section
            key="card"
            {...swap}
            aria-label="While you were away"
            className={className}
          >
            <AgentArtifactCard className="mt-0">
              <AgentCardHeader
                action={
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setFolded(true);
                      onDismiss?.();
                    }}
                  >
                    Got it
                  </Button>
                }
              >
                <AgentCardEyebrow label={`While you were away · ${formatAway(now - since)}`} />
                <AgentCardTitle>{tally}</AgentCardTitle>
              </AgentCardHeader>
              <AgentCardBody className="pt-2 pb-3">
                <ItemGroup className="gap-0.5">
                  {rows.map((item) => {
                    const { icon: Icon, tile } = RECAP_TONE[item.tone];
                    return (
                      <Item
                        key={item.id}
                        role="listitem"
                        size="xs"
                        className="-mx-1.5 rounded-md px-1.5 hover:bg-muted/40"
                      >
                        <ItemMedia>
                          <span className={cn('grid size-6 place-items-center rounded-full', tile)}>
                            <Icon className="size-3.5" />
                          </span>
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="w-full truncate text-xs">{item.title}</ItemTitle>
                          <ItemDescription className="truncate text-2xs">
                            {[item.detail, formatRelativeTime(item.at, now)]
                              .filter(Boolean)
                              .join(' · ')}
                          </ItemDescription>
                        </ItemContent>
                        {item.actionLabel && onAction && (
                          <ItemActions>
                            <Button
                              size="xs"
                              variant={item.tone === 'needs' ? 'default' : 'outline'}
                              onClick={() => onAction(item)}
                            >
                              {item.actionLabel}
                            </Button>
                          </ItemActions>
                        )}
                      </Item>
                    );
                  })}
                </ItemGroup>
              </AgentCardBody>
            </AgentArtifactCard>
          </motion.section>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
