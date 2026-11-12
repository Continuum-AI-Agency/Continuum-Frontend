import { useTranslations } from 'next-intl';

// The three marks that make the Brand DNA reveal honest, in one place because they say
// one thing: here is what we read, and here is where we read nothing.
//
// `reveal.ts` decides; this file is layout. The rule that shapes all three is the one
// `settings/brand/BrandEnginePanels.tsx` already follows — a value carries where it came
// from, and a gap is SHOWN rather than filled in.

import { NoSpecimenText } from '@/components/brand/typefaceHonesty';
import { Badge } from '@/components/ui/badge';
import { ColorSwatch } from './ColorSwatch';
import type { FieldProvenance, RevealedColour, RevealedTypeface } from './reveal';

/**
 * READ or EMPTY, on the field itself.
 *
 * Empty is a correct outcome, not a failure, so it is amber rather than red — but it is
 * never silence: a blank region and a region we looked at and found nothing in are
 * indistinguishable to a reader, and only one of them is the truth.
 */
export function ProvenanceMark({
  field,
  provenance,
  emptyLabel,
}: {
  field: string;
  provenance: FieldProvenance;
  emptyLabel?: string;
}) {
  const tUi = useTranslations('onboarding');
  const tCommon = useTranslations('common');

  return (
    <Badge
      variant={provenance.read ? 'muted' : 'warning'}
      className="text-2xs font-medium"
      data-testid="field-provenance"
      data-field={field}
      data-provenance={provenance.read ? 'read' : 'empty'}
    >
      {provenance.read
        ? tUi('m_394dc1bb60', { v0: String(provenance.source) })
        : (emptyLabel ?? tCommon('nothingFound'))}
    </Badge>
  );
}

/**
 * A family NAME, never a specimen.
 *
 * The name is deliberately rendered in the app's own typeface with no `fontFamily`
 * override anywhere in this subtree — see `typefaceHonesty.tsx` for why a browser cannot
 * have the brand's face, and why drawing `Aa` in a substitute is worse than drawing
 * nothing.
 */
export function TypefaceReadout({ slot, family, usedFor, provenance }: RevealedTypeface) {
  const tUi = useTranslations('onboarding');

  return (
    <div
      className="min-w-0"
      data-testid="reveal-typeface"
      data-slot={slot}
      data-family={family ?? ''}
      data-provenance={provenance.read ? 'read' : 'empty'}
    >
      <p className="truncate text-sm font-medium text-foreground">
        {family ?? tUi('m_a16a74355f')}
      </p>
      <p className="text-2xs text-muted-foreground">
        {slot} · {usedFor}
      </p>
      <div className="mt-1">
        <ProvenanceMark
          field={`typeface-${slot.toLowerCase()}`}
          provenance={provenance}
          emptyLabel={tUi('m_bc45bfd7e5')}
        />
      </div>
    </div>
  );
}

/** The sentence under the two readouts. Shared verbatim with the settings panel. */
export function NoSpecimenNote() {
  return (
    <p className="text-2xs leading-snug text-muted-foreground" data-testid="no-specimen-note">
      <NoSpecimenText />
    </p>
  );
}

/**
 * The strip is recognition; the rows under it are the rule.
 *
 * A row only carries a sentence when the run recorded a ROLE for that hex. Inventing one
 * ("this is your accent") from position in an array is exactly the kind of claim this
 * screen exists to stop making.
 */
export function PaletteReadout({ colours }: { colours: RevealedColour[] }) {
  const tCommon = useTranslations('common');
  return (
    <div data-testid="reveal-palette">
      <div className="flex flex-wrap gap-2" data-testid="reveal-palette-strip">
        {colours.map((colour) => (
          <ColorSwatch key={`strip-${colour.hex}`} hex={colour.hex} />
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {colours.map((colour) => (
          <div
            key={`row-${colour.hex}`}
            className="flex items-baseline justify-between gap-3"
            data-testid="reveal-colour"
            data-hex={colour.hex}
            data-recorded={colour.rule ? 'true' : 'false'}
          >
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {colour.hex}
            </span>
            <p
              className={`min-w-0 text-right text-2xs leading-snug ${
                colour.rule ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'
              }`}
              data-testid="reveal-colour-rule"
            >
              {colour.rule ?? tCommon('brandColourNoRecordedRole')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
