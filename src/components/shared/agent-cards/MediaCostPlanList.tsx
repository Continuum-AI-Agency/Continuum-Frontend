import { type MediaCostPlan, unitPriceText } from '@continuum/contracts';
import { cn } from '@/lib/utils';

const usd = (value: number) => `$${value.toFixed(2)}`;
const UNIT: Record<MediaCostPlan['lines'][number]['unit'], string> = {
  second: 's',
  image: 'image',
  call: 'call',
};

/**
 * The priced pre-plan a media tool's approval card shows: every Omni clip, still and song bed the
 * approved work makes, at the price the meter charges, beside the cap the run cannot pass. The
 * headline is what the brand is billed; the lines are list price, the unit every cap is written in.
 */
export function MediaCostPlanList({
  plan,
  className,
}: {
  plan: MediaCostPlan;
  className?: string;
}) {
  return (
    <details data-slot="media-cost-plan" className={cn('group text-xs tabular-nums', className)}>
      <summary className="cursor-pointer list-none text-foreground">
        <span className="font-medium">
          Up to <span data-field="billed-cap-usd">{usd(plan.billedCapUsd)}</span>
        </span>
        <span className="text-muted-foreground">
          {' · typically '}
          <span data-field="billed-expected-usd">{usd(plan.billedExpectedUsd)}</span>
        </span>
        <span className="block text-2xs text-muted-foreground group-open:hidden">
          {plan.lines.length > 0 ? 'Show the cost plan' : (plan.note ?? 'No generations itemized')}
        </span>
      </summary>
      {plan.lines.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {plan.lines.map((line, index) => (
            <li
              // A plan is rebuilt whole, never reordered: the index is the line's identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={index}
              data-model={line.model}
              className="grid grid-cols-[1fr_auto] gap-x-2"
            >
              <span className="text-foreground/90">{line.what}</span>
              <span className="text-right text-foreground">{usd(line.usd)}</span>
              <span className="col-span-2 text-2xs text-muted-foreground">
                {`${line.quantity} ${UNIT[line.unit]}${line.quantity === 1 || line.unit === 'second' ? '' : 's'} × ${unitPriceText(line.unitUsd)} · ${line.model}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">
        {`List price ${usd(plan.expectedUsd)} for one pass, cap ${usd(plan.capUsd)}.`}
        {plan.lines.length > 0 && plan.note ? ` ${plan.note}` : null}
      </p>
    </details>
  );
}
