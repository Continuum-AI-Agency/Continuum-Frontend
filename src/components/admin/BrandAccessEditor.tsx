'use client';

import {
  ADMIN_CREDIT_GRANT_MAX_USD,
  type AdminBrandAccess,
  type ProductCode,
} from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminActionConfirmation } from '@/components/admin/AdminActionConfirmation';
import {
  ACCESS_PRODUCTS,
  describeBillingPlan,
  isStripeManaged,
  productGrant,
} from '@/components/admin/adminUserListUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { localizeAdminCopy } from '@/i18n/adminCopy';
import { readPrice } from '@/lib/onboarding/catalog';

type BrandAccessEditorProps = {
  brandId: string;
  brandName: string;
  access: AdminBrandAccess | null;
  /** billing-cutover: false until billing is live — the grid renders, disabled, under a note. */
  live: boolean;
  pending: boolean;
  onToggleProduct: (product: ProductCode, next: boolean) => void;
  onSetContract: (next: boolean) => void;
  onFullAccess: () => void;
  /** Resolves true once the grant is saved, so the form can clear. */
  onAddCredits: (usd: number, reason: string) => Promise<boolean>;
  onSetClient: (next: boolean) => void;
};

// One brand's product grid, Contract override, full-access preset, Canvas credits and client
// flag. Stripe-sourced products are shown checked and locked: only Stripe (or a Contract
// override) may take them away.
export function BrandAccessEditor({
  brandId,
  brandName,
  access,
  live,
  pending,
  onToggleProduct,
  onSetContract,
  onFullAccess,
  onAddCredits,
  onSetClient,
}: BrandAccessEditorProps) {
  const uiText = useTranslations('admin');
  const uiLocale = useLocale();
  const credits = new Intl.NumberFormat(uiLocale);
  const disabled = !live || pending;
  const isContract = access?.billingModel === 'contract';
  const contractId = `access-${brandId}-contract`;
  const clientId = `access-${brandId}-client`;
  const [confirmingContract, setConfirmingContract] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const parsedAmount = readPrice(creditAmount, 'USD', uiLocale);
  const amountUsd =
    parsedAmount.ok && parsedAmount.price ? parsedAmount.price.amountMinor / 100 : Number.NaN;
  const creditValid =
    creditAmount !== '' &&
    amountUsd > 0 &&
    amountUsd <= ADMIN_CREDIT_GRANT_MAX_USD &&
    creditReason.trim().length > 0;

  async function submitCredits() {
    if (disabled || !creditValid) return;
    if (await onAddCredits(amountUsd, creditReason.trim())) {
      setCreditAmount('');
      setCreditReason('');
    }
  }

  return (
    <FieldSet
      data-testid="brand-access-editor"
      data-brand-id={brandId}
      className="mt-3 gap-2 border-t border-subtle pt-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <FieldLegend
          variant="label"
          className="mb-0 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground data-[variant=label]:text-xs"
        >
          {uiText('product_access_d8f65c7')}
        </FieldLegend>
        {live ? (
          <span className="truncate text-xs text-muted-foreground" data-testid="brand-billing-plan">
            {describeBillingPlan(access, uiText)}
          </span>
        ) : null}
      </div>
      {access?.internal ? (
        <Badge variant="secondary" className="w-fit" data-testid="brand-internal-badge">
          {uiText('internal_unmetered_3e44a65')}
        </Badge>
      ) : null}
      {live ? null : (
        <FieldDescription className="text-xs">
          {uiText('product_access_activates_at_billing_go_live_ce6af68')}
        </FieldDescription>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {ACCESS_PRODUCTS.map(({ product, label }) => {
          const id = `access-${brandId}-${product}`;
          const stripe = isStripeManaged(access, product);
          const locked = disabled || stripe;
          return (
            <Field key={product} orientation="horizontal" data-disabled={locked || undefined}>
              <Checkbox
                id={id}
                checked={Boolean(productGrant(access, product))}
                disabled={locked}
                onCheckedChange={(checked) => onToggleProduct(product, checked === true)}
              />
              <FieldLabel htmlFor={id} className="flex-none text-sm font-normal">
                {localizeAdminCopy(label, uiText)}
              </FieldLabel>
              {stripe ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {uiText('m_4d08ec5874')}
                </Badge>
              ) : null}
            </Field>
          );
        })}
      </div>
      <Field orientation="horizontal" data-disabled={disabled || undefined} className="pt-1">
        <Switch
          id={contractId}
          checked={isContract}
          disabled={disabled}
          size="sm"
          onCheckedChange={() => setConfirmingContract(true)}
        />
        <FieldLabel htmlFor={contractId} className="text-sm font-normal">
          {uiText('contract_a6f5b0e')}
        </FieldLabel>
        <AdminActionConfirmation
          open={confirmingContract}
          onOpenChange={setConfirmingContract}
          title={
            isContract
              ? uiText('m_903a770945', { v0: String(brandName) })
              : uiText('m_251a6afdb0', { v0: String(brandName) })
          }
          description={
            isContract
              ? uiText('the_brand_goes_back_to_no_billing_model_its_p_839e0e8')
              : uiText('contract_turns_every_product_on_billed_off_st_3bfc970')
          }
          confirmLabel={isContract ? uiText('m_e61faef69e') : uiText('m_cf76b165e3')}
          onConfirm={() => onSetContract(!isContract)}
        />
      </Field>
      {access?.internalAuthored ? (
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Switch
            id={clientId}
            checked={!access.internal}
            disabled={disabled}
            size="sm"
            onCheckedChange={(checked) => onSetClient(checked === true)}
          />
          <FieldLabel htmlFor={clientId} className="text-sm font-normal">
            {uiText('client_metered_0ed5143')}
          </FieldLabel>
        </Field>
      ) : null}
      <div className="flex justify-end pt-1">
        <AdminActionConfirmation
          trigger={
            <Button size="sm" variant="outline" disabled={disabled}>
              {uiText('full_access_f19611c')}
            </Button>
          }
          title={uiText('m_ba5a41a392', { v0: String(brandName) })}
          description={uiText('turns_on_every_product_canvas_organic_perform_1696785')}
          confirmLabel={uiText('m_acc06b922d')}
          onConfirm={onFullAccess}
        />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {uiText('canvas_credits_e61faef')}
          </span>
          <span className="text-xs tabular-nums text-foreground" data-testid="brand-canvas-credits">
            {uiText.rich('sentence_d02b54d07351', {
              count: access?.canvasCredits ?? 0,
              amount: credits.format(access?.canvasCredits ?? 0),
            })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            inputSize="sm"
            inputMode="decimal"
            placeholder={uiText('m_57814cfbae')}
            aria-label={uiText('credits_to_add_usd_468d9b1')}
            className="w-24"
            value={creditAmount}
            aria-invalid={creditAmount !== '' && !Number.isFinite(amountUsd)}
            disabled={disabled}
            onChange={(event) => setCreditAmount(event.target.value)}
          />
          <Input
            inputSize="sm"
            placeholder={uiText('reason_f81ab83')}
            aria-label={uiText('reason_for_the_credits_327b09b')}
            className="min-w-0 flex-1"
            maxLength={500}
            value={creditReason}
            disabled={disabled}
            onChange={(event) => setCreditReason(event.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !creditValid}
            onClick={() => void submitCredits()}
          >
            {uiText('add_credits_d22feb6')}
          </Button>
        </div>
        {creditAmount !== '' && !Number.isFinite(amountUsd) ? (
          <p role="alert" className="text-xs text-destructive">
            {uiText('m_f47bf7764a')}
          </p>
        ) : null}
        <FieldDescription className="text-xs">
          {uiText.rich('sentence_63bb18a718ed', {
            v0: () => credits.format(ADMIN_CREDIT_GRANT_MAX_USD),
          })}
        </FieldDescription>
      </div>
    </FieldSet>
  );
}
