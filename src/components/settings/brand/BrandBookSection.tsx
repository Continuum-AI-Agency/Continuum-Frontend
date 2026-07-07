import type { BrandBookResponse } from '@continuum/contracts';

import { BrandBookEmptyState } from './BrandBookEmptyState';
import { BrandBookView } from './BrandBookView';
import type { BrandBookGenerationPayload } from './brandBookGeneration';

export type BrandBookGeneration = {
  brandId: string;
  brandName: string;
  payload: BrandBookGenerationPayload | null;
};

// The Brand Book settings surface. Routes an absent/assembling/errored book to
// the empty-state CTA; a ready book renders the curated, tabbed BrandBookView.
// All presentation (swatches, type specimens, voice/strategy, readiness) lives in
// BrandBookView — this component only decides which state to show.
export function BrandBookSection({
  brandBook,
  generation,
}: {
  brandBook: BrandBookResponse | null;
  generation?: BrandBookGeneration | null;
}) {
  if (!brandBook || !brandBook.present) {
    if (generation) {
      return (
        <BrandBookEmptyState
          brandId={generation.brandId}
          brandName={generation.brandName}
          payload={generation.payload}
        />
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        Your Brand Book is assembling from your onboarding, guidelines, and documents. Check back in
        a moment.
      </p>
    );
  }

  const brandName =
    brandBook.brand_tokens?.brand_name ??
    brandBook.composite?.brand_profile?.brand_name ??
    generation?.brandName ??
    'Your Brand Book';

  return <BrandBookView brandBook={brandBook} brandName={brandName} />;
}
