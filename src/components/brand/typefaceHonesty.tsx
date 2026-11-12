// One answer to "may we draw this typeface?", for every surface that shows a brand its
// own fonts.
//
// The answer is NO, and it is not a layout preference. `Continuum-Backend/App/
// brand-knowledge/fonts/store.ts` never calls `getPublicUrl` and never mints a signed
// URL for a brand font: the licence belongs to the brand, and serving one openly is
// redistribution. No URL that resolves to a brand face is ever produced, so a browser
// cannot have the face — and `style={{ fontFamily: family }}` therefore falls through to
// the app's own typeface while the label underneath says the brand's name. That draws a
// typeface the brand never chose and tells the customer we detected theirs. Drawing
// nothing is the honest output; the family NAME plus what we hold is the useful one.
//
// The two surfaces that use this keep their own LAYOUT, because they answer different
// questions: settings renders one row per family per weight against the font store
// (`BrandEnginePanels`), onboarding renders the two families a site scan found and has no
// store to check yet (`dna/IdentityPanel`). What they may not do is give two different
// answers to THIS question, so the sentence and the badge live here rather than twice.

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

/**
 * Why no `Aa` is drawn. Rendered verbatim on both surfaces — a reader who sees a family
 * name and no specimen otherwise concludes the page is broken.
 */
export function NoSpecimenText() {
  const translate = useTranslations('common');
  return translate('typefaceNoSpecimen');
}

/**
 * A fact about the font STORE, never about the document. A family a design system names
 * is a family a piece will not ship in unless the file is there.
 */
export function TypefaceHoldBadge({ held }: { held: boolean }) {
  const translate = useTranslations('common');
  return (
    <Badge variant={held ? 'success' : 'warning'} data-testid="type-badge">
      {translate(held ? 'typefaceHeld' : 'typefaceMissing')}
    </Badge>
  );
}
