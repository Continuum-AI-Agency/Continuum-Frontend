import { NextResponse } from 'next/server';

/**
 * @deprecated Use edge billing-api POST /brands/:brandId/checkout
 * Grants still apply only via stripe-billing-webhook → SQL.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'use_billing_api_edge',
      message:
        'Billing checkout moved to edge billing-api. POST /functions/v1/billing-api/brands/:brandId/checkout',
    },
    { status: 410 },
  );
}
