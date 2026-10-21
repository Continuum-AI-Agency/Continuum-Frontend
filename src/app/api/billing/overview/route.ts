import { NextResponse } from 'next/server';

/**
 * @deprecated Billing product traffic must use Supabase edge `billing-api`.
 * GET {SUPABASE_URL}/functions/v1/billing-api/brands/:brandId/overview
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'use_billing_api_edge',
      message:
        'Billing overview moved to edge billing-api. Call /functions/v1/billing-api/brands/:brandId/overview with the user JWT.',
    },
    { status: 410 },
  );
}
