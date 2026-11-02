// Reads one brand for the Home: its Optimizer portfolios, what onboarding learned about the
// business (the Brand Book's structured business section), and whether changes need approval,
// on top of the accounts and saved goals the caller already holds. Every read degrades to "no
// signal" on failure, so a slow or missing table can change the reading but never break the Home.
import 'server-only';

import {
  type HomeBrandReading,
  type HomeBrandSignals,
  type HomeProfileRow,
  readBrand,
} from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  type AccountBuckets,
  accountCountsFrom,
  businessFrom,
  portfolioSignalsFrom,
  savedGoalFrom,
} from './brandSignals';

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function loadPortfolioRows(supabase: Supabase, brandId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc('optimizer_list_portfolios', { p_brand_id: brandId });
  if (error) {
    console.warn('[brandReading] portfolios read failed; reading without them', {
      brandId,
      code: error.code,
    });
    return [];
  }
  return data;
}

async function loadBusiness(
  supabase: Supabase,
  brandId: string,
): Promise<{ business: HomeBrandSignals['business']; approvalRequired: boolean }> {
  const [book, row] = await Promise.all([
    supabase
      .schema('brand_profiles')
      .from('brand_book')
      .select(
        'business:assembled->report->composite->structured->business, headline:assembled->report->composite->first_impression->headline',
      )
      .eq('brand_id', brandId)
      .maybeSingle(),
    supabase
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('description, approval_chain_required')
      .eq('id', brandId)
      .maybeSingle(),
  ]);
  if (book.error || row.error) {
    console.warn('[brandReading] business read failed; reading without it', {
      brandId,
      book: book.error?.code ?? null,
      row: row.error?.code ?? null,
    });
  }
  const bookData = (book.data ?? {}) as { business?: unknown; headline?: unknown };
  const rowData = (row.data ?? {}) as { description?: unknown; approval_chain_required?: unknown };
  return {
    business: businessFrom({
      structuredBusiness: bookData.business,
      headline: bookData.headline,
      brandDescription: rowData.description,
    }),
    approvalRequired: rowData.approval_chain_required === true,
  };
}

export async function loadBrandReading(input: {
  brandId: string;
  summary: AccountBuckets;
  profileRows: HomeProfileRow[];
}): Promise<HomeBrandReading> {
  const supabase = await createSupabaseServerClient();
  const [portfolioRows, { business, approvalRequired }] = await Promise.all([
    loadPortfolioRows(supabase, input.brandId),
    loadBusiness(supabase, input.brandId),
  ]);
  return readBrand({
    accounts: accountCountsFrom(input.summary),
    savedGoal: savedGoalFrom(input.profileRows),
    business,
    portfolios: portfolioSignalsFrom(portfolioRows),
    approvalRequired,
  });
}
