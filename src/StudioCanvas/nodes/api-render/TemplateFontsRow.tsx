'use client';

import type { ApiRenderTemplateFont } from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import { InspectorNote, InspectorSection } from '../../components/inspector/controls';

/**
 * Which typefaces this design needs, and whether the brand has them.
 *
 * Nothing checked this before. A template missing a font does not fail: After Effects renders
 * it in a fallback face and hands back a finished frame, which is indistinguishable from
 * success until someone looks at the ad. That has already happened on a live render — a 9:16
 * went out in a condensed substitute nobody chose.
 *
 * Since the shared font repository shipped the render is REFUSED at preflight instead
 * (`render_fonts_missing`), so this panel now warns about a render that will not start rather
 * than one that will quietly substitute.
 *
 * The honest limit is still stated rather than implied: Continuum attaches each face to the
 * trigger as a signed URL, but the fleet's worker bootstrap has to install and verify it
 * (`docs/render-fleet-font-contract.md`). Until it does, "held" means "we have the file and
 * can send it", not "that worker has it installed".
 */
export function TemplateFontsRow({
  fonts,
  brandId,
  assetId,
}: {
  fonts: ApiRenderTemplateFont[];
  brandId: string | null;
  assetId: string | null;
}) {
  const translateUi = useUiTranslations('studio');

  // Empty is not "no fonts needed" — it is "nobody read this template". Saying nothing is
  // better than a green tick over an unread file.
  if (fonts.length === 0) return null;
  const missing = fonts.filter((font) => !font.held);

  return (
    <InspectorSection title={translateUi('typefaces_a6abd3ff')}>
      <div className="flex flex-wrap gap-1">
        {fonts.map((font) => (
          <Badge key={font.family} variant={font.held ? 'success' : 'warning'}>
            {font.family}
            {font.layers > 1 ? ` ×${font.layers}` : ''}
            {/* A house face is ours fleet-wide, not this brand's upload — worth saying, because
                otherwise someone goes looking for an upload that was never theirs to make. */}
            {font.scope === 'house' ? translateUi('house_21a7e9bf') : ''}
          </Badge>
        ))}
      </div>
      {missing.length > 0 ? (
        <InspectorNote>
          {missing.length} {translateUi('face_0282d9b7')}
          {missing.length === 1 ? '' : 's'}{' '}
          {translateUi('nobody_has_uploaded_upload_the_miss_25d0d28c')}{' '}
          {brandId ? (
            <Link className="underline underline-offset-2" href="/library?section=typography">
              {' '}
              {translateUi('upload_them_154a0a57')}{' '}
            </Link>
          ) : null}
        </InspectorNote>
      ) : (
        <InspectorNote>
          {' '}
          {translateUi('every_face_is_in_the_font_repositor_ef9af3bc')}{' '}
          {assetId ? '' : translateUi('this_template_has_no_parsed_source__75793fce')}.
        </InspectorNote>
      )}
    </InspectorSection>
  );
}
