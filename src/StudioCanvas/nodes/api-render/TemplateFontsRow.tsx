'use client';

import type { ApiRenderTemplateFont } from '@continuum/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { InspectorNote, InspectorSection } from '../../components/inspector/controls';

/**
 * Which typefaces this design needs, and whether the brand has them.
 *
 * Nothing checked this before. A template missing a font does not fail: After Effects renders
 * it in a fallback face and hands back a finished frame, which is indistinguishable from
 * success until someone looks at the ad. That has already happened on a live render — a 9:16
 * went out in a condensed substitute nobody chose.
 *
 * The honest limit is stated rather than implied: holding a face in the brand kit is not the
 * same as the render worker being able to resolve it. Pushing the file onto the template is a
 * separate act, and until it happens "held" means "uploaded here", not "installed there".
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
  // Empty is not "no fonts needed" — it is "nobody read this template". Saying nothing is
  // better than a green tick over an unread file.
  if (fonts.length === 0) return null;
  const missing = fonts.filter((font) => !font.held);

  return (
    <InspectorSection title="Typefaces">
      <div className="flex flex-wrap gap-1">
        {fonts.map((font) => (
          <Badge key={font.family} variant={font.held ? 'success' : 'warning'}>
            {font.family}
            {font.layers > 1 ? ` ×${font.layers}` : ''}
          </Badge>
        ))}
      </div>
      {missing.length > 0 ? (
        <InspectorNote>
          {missing.length} face{missing.length === 1 ? '' : 's'} the brand does not hold. The render
          will not fail — it substitutes, and the frame looks finished.{' '}
          {brandId ? (
            <Link className="underline underline-offset-2" href="/library?section=typography">
              Upload them
            </Link>
          ) : null}
        </InspectorNote>
      ) : (
        <InspectorNote>
          Every face is in the brand kit. Held here is not yet proof the render worker can resolve
          it{assetId ? '' : ' — this template has no parsed source to push them to'}.
        </InspectorNote>
      )}
    </InspectorSection>
  );
}
