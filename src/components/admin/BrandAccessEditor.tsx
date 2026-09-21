'use client';

import type { AdminBrandAccess, ProductCode } from '@continuum/contracts';
import { useState } from 'react';
import { AdminActionConfirmation } from '@/components/admin/AdminActionConfirmation';
import {
  ACCESS_PRODUCTS,
  describeBillingPlan,
  isStripeManaged,
  productGrant,
} from '@/components/admin/adminUserListUtils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
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
};

// One brand's product grid and Contract override. Stripe-sourced products are shown checked
// and locked: only Stripe (or a Contract override) may take them away.
export function BrandAccessEditor({
  brandId,
  brandName,
  access,
  live,
  pending,
  onToggleProduct,
  onSetContract,
}: BrandAccessEditorProps) {
  const disabled = !live || pending;
  const isContract = access?.billingModel === 'contract';
  const contractId = `access-${brandId}-contract`;
  const [confirmingContract, setConfirmingContract] = useState(false);

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
    </FieldSet>
  );
}
