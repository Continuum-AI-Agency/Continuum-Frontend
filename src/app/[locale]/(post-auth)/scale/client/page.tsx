import { redirect } from 'next/navigation';
import { ProductGate } from '@/components/billing/ProductGate';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function PaidMediaClientRedirectPage() {
  // Every /scale page gates itself (productGate.guard.test.ts), this old address included: a brand
  // without the plan goes straight to Billing instead of through /scale.
  const denied = await ProductGate('scale');
  if (denied) return denied;
  redirect('/scale');
}
