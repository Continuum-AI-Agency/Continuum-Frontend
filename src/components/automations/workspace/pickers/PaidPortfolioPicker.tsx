'use client';

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
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label="Optimizer portfolio ID"
        value={selected}
        disabled={disabled}
        placeholder="Portfolio id"
        reason={
          brandId
            ? 'Portfolios could not be loaded. The stored portfolio stays editable here.'
            : 'No brand is in scope, so portfolios cannot be listed.'
        }
        onChange={(raw) => onChange(raw.trim() || null)}
      />
    );
  }

  // A portfolio archived after the step was configured must stay visible, or
  // touching the field at all would discard the stored target.
  const options = items.map((portfolio) => ({ value: portfolio.id, label: portfolio.name }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: `Unavailable portfolio (${selected})` });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Optimizer portfolio</Label>
      <Select
        value={selected ?? ''}
        disabled={disabled || isLoading || options.length === 0}
        onValueChange={onChange}
      >
        <SelectTrigger id={id} aria-label="Optimizer portfolio">
          <SelectValue placeholder={isLoading ? 'Loading portfolios…' : 'Select a portfolio'} />
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
        <p className="text-[11px] leading-4 text-muted-foreground">
          This brand has no optimizer portfolios yet. Create one in Paid Media first.
        </p>
      ) : selected === null ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          This step cannot run or publish until a portfolio is chosen.
        </p>
      ) : null}
    </div>
  );
}
