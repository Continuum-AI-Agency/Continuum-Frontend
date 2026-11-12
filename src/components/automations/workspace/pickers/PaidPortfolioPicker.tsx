'use client';
import { useTranslations } from 'next-intl';

// The optimizer PORTFOLIO a paid-optimizer step acts on.
//
// The optimizer has no entity-addressed write surface — pause, resume, budget
// writes and creative swaps are all either human-only or reached by approving a
// recommendation — so the only thing an automation can address is a portfolio.
// The list is the brand's own portfolios across every ad account, because an
// automation is not scoped to whichever account the optimizer surface happens to
// be showing.

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type PortfolioOption, useOptimizerPortfolioSource } from './defaultPickerSources';
import { isUnsetId, type PickerSource, RawIdFallbackField } from './pickerSource';

export function PaidPortfolioPicker({
  brandId,
  value,
  disabled,
  onChange,
  useSource = useOptimizerPortfolioSource,
}: {
  brandId?: string;
  value: string | null;
  disabled: boolean;
  onChange: (portfolioId: string | null) => void;
  useSource?: PickerSource<PortfolioOption>;
}) {
  const uiText = useTranslations('automations');
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label={uiText('optimizer_portfolio_id_b03482b')}
        value={selected}
        disabled={disabled}
        placeholder={uiText('portfolio_id_d52dadf')}
        reason={brandId ? uiText('m_25da629a32') : uiText('m_c29db1e906')}
        onChange={(raw) => onChange(raw.trim() || null)}
      />
    );
  }

  // A portfolio archived after the step was configured must stay visible, or
  // touching the field at all would discard the stored target.
  const options = items.map((portfolio) => ({
    value: portfolio.id,
    label: portfolio.name,
  }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({
      value: selected,
      label: uiText('m_d192f4399d', { id: selected }),
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{uiText('optimizer_portfolio_5953d86')}</Label>
      <Select
        value={selected ?? ''}
        disabled={disabled || isLoading || options.length === 0}
        onValueChange={onChange}
      >
        <SelectTrigger id={id} aria-label={uiText('optimizer_portfolio_5953d86')}>
          <SelectValue
            placeholder={
              isLoading
                ? uiText('loading_portfolios_c4ff694')
                : uiText('select_a_portfolio_7b84d14')
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isLoading && options.length === 0 ? (
        <p className="text-xs leading-4 text-muted-foreground">
          {uiText('this_brand_has_no_optimizer_portfolios_yet_cr_f8e34b5')}
        </p>
      ) : selected === null ? (
        <p className="text-xs leading-4 text-muted-foreground">
          {uiText('this_step_cannot_run_or_publish_until_a_portf_1e8127e')}
        </p>
      ) : null}
    </div>
  );
}
