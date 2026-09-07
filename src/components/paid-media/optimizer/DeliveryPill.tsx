'use client';

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { deliveryLabel } from './reportModel';

// Was this ad set being SERVED? Every cost, CTR and CPA figure on its row is a ratio that
// presumes it was, and for 17 of 85 active ad sets on the live account that presumption was
// false — zero impressions across a week, while the table showed a confident cost per result
// computed from the days before the delivery stopped.
//
// Renders nothing for a normally-serving ad set, and nothing when delivery is UNKNOWN. A
// missing read must not decorate the row with reassurance it has not earned.
export function DeliveryPill({ state }: { state: string | null | undefined }) {
  const delivery = deliveryLabel(state);
  if (!delivery) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pill variant="secondary" className="cursor-default">
              <PillIndicator variant={delivery.tone} />
              {delivery.label}
            </Pill>
          </button>
        }
      />
      <TooltipContent className="max-w-64 text-xs">{delivery.hint}</TooltipContent>
    </Tooltip>
  );
}
