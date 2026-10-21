import { NextResponse } from 'next/server';

/**
 * @deprecated Use edge billing-api POST /brands/:brandId/portal
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'use_billing_api_edge',
      message:
        'Billing portal moved to edge billing-api. POST /functions/v1/billing-api/brands/:brandId/portal',
    },
    { status: 410 },
  );
}
