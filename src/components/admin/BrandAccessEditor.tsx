'use client';

import {
  ADMIN_CREDIT_GRANT_MAX_USD,
  type AdminBrandAccess,
  type ProductCode,
} from '@continuum/contracts';
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

const credits = new Intl.NumberFormat('en-US');

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
  const disabled = !live || pending;
  const isContract = access?.billingModel === 'contract';
  const contractId = `access-${brandId}-contract`;
  const clientId = `access-${brandId}-client`;
  const [confirmingContract, setConfirmingContract] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const amountUsd = Number(creditAmount);
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
          Product access
        </FieldLegend>
        {live ? (
          <span className="truncate text-xs text-muted-foreground" data-testid="brand-billing-plan">
            {describeBillingPlan(access)}
          </span>
        ) : null}
      </div>
      {access?.internal ? (
        <Badge variant="secondary" className="w-fit" data-testid="brand-internal-badge">
          Internal · unmetered
        </Badge>
      ) : null}
      {live ? null : (
        <FieldDescription className="text-xs">
          Product access activates at billing go-live.
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
                {label}
              </FieldLabel>
              {stripe ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  Stripe
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
          Contract
        </FieldLabel>
        <AdminActionConfirmation
          open={confirmingContract}
          onOpenChange={setConfirmingContract}
          title={
            isContract ? `Remove Contract from ${brandName}?` : `Set ${brandName} to Contract?`
          }
          description={
            isContract
              ? 'The brand goes back to no billing model. Its products stay on — turn them off one by one if it should lose access. This is written to the admin audit log.'
              : 'Contract turns every product on, billed off Stripe: never metered, never blocked. This is written to the admin audit log.'
          }
          confirmLabel={isContract ? 'Remove Contract' : 'Set Contract'}
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
            Client (metered)
          </FieldLabel>
        </Field>
      ) : null}
      <div className="flex justify-end pt-1">
        <AdminActionConfirmation
          trigger={
            <Button size="sm" variant="outline" disabled={disabled}>
              Full access
            </Button>
          }
          title={`Give ${brandName} full access?`}
          description="Turns on every product (Canvas, Organic, Performance, Trends Pro, MCP) and the providers Trends Pro uses (Exa, SerpAPI, Apify), granted by an admin. Stripe and Contract grants stay as they are. Canvas stays metered: the brand still spends credits — set Contract for an unmetered brand. This is written to the admin audit log."
          confirmLabel="Give full access"
          onConfirm={onFullAccess}
        />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Canvas credits</span>
          <span className="text-xs tabular-nums text-primary" data-testid="brand-canvas-credits">
            {credits.format(access?.canvasCredits ?? 0)} credits
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            inputSize="sm"
            inputMode="decimal"
            min={0.01}
            max={ADMIN_CREDIT_GRANT_MAX_USD}
            step={0.01}
            placeholder="USD"
            aria-label="Credits to add (USD)"
            className="w-24"
            value={creditAmount}
            disabled={disabled}
            onChange={(event) => setCreditAmount(event.target.value)}
          />
          <Input
            inputSize="sm"
            placeholder="Reason"
            aria-label="Reason for the credits"
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
            Add credits
          </Button>
        </div>
        <FieldDescription className="text-xs">
          Up to ${ADMIN_CREDIT_GRANT_MAX_USD} per grant (1 credit = $0.01). Credits never expire.
        </FieldDescription>
      </div>
    </FieldSet>
  );
}
