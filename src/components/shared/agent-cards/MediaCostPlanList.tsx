import { type MediaCostPlan, unitPriceText } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const usd = (value: number) => `$${value.toFixed(2)}`;

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
  const uiText = useTranslations('common');
  return (
    <details data-slot="media-cost-plan" className={cn('group text-xs tabular-nums', className)}>
      <summary className="cursor-pointer list-none text-foreground">
        <span className="font-medium">
          {uiText.rich('up_to_cap_amount_cap_de94338', {
            amount: usd(plan.billedCapUsd),
            cap: (chunks) => <span data-field="billed-cap-usd">{chunks}</span>,
          })}
        </span>
        <span className="text-muted-foreground">
          {uiText.rich('typically_expected_amount_expected_5e0189a', {
            amount: usd(plan.billedExpectedUsd),
            expected: (chunks) => <span data-field="billed-expected-usd">{chunks}</span>,
          })}
        </span>
        <span className="block text-2xs text-muted-foreground group-open:hidden">
          {plan.lines.length > 0
            ? uiText('show_the_cost_plan_163c535')
            : (plan.note ?? uiText('no_generations_itemized_34a957a'))}
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
                {uiText('unit_select_second_quantity_s_image_quantity__1835a91', {
                  unit: line.unit,
                  quantity: line.quantity,
                  price: unitPriceText(line.unitUsd),
                  model: line.model,
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">
        {uiText('list_price_expected_for_one_pass_cap_cap_7529472', {
          expected: usd(plan.expectedUsd),
          cap: usd(plan.capUsd),
        })}
        {plan.lines.length > 0 && plan.note ? ` ${plan.note}` : null}
      </p>
    </details>
  );
}
