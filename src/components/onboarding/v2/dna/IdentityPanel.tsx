import { ArrowSquareOut, Sparkle } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createSignedAssetUrl } from '@/lib/creative-assets/storageClient';
import type { ReadinessFinding, WebsitePalette } from '@/lib/onboarding/agentClient';
import { FindingCallout } from '../readiness/FindingCallout';
import type { AgentPreviewBuckets } from '../state/agentPreview';
import { EditableHeading } from './EditableHeading';
import { NoSpecimenNote, PaletteReadout, ProvenanceMark, TypefaceReadout } from './RevealMarks';
import { deriveRevealedPalette, deriveRevealedTypography, provenanceOf } from './reveal';
import { TonePicker } from './TonePicker';

type IdentityPanelProps = {
  name: string;
  host: string | null;
  heroStatement: string | null;
  logoPath: string | null;
  colors: string[];
  typography: { primary: string | null; secondary: string | null };
  toneFinding?: ReadinessFinding | null;
  brandIdentityChip?: ReactNode;
  messagingChip?: ReactNode;
  agentBuckets?: AgentPreviewBuckets | null;
  onRename: (next: string) => void;
};

export function IdentityPanel({
  name,
  host,
  heroStatement,
  logoPath,
  colors,
  typography,
  toneFinding,
  brandIdentityChip,
  messagingChip,
  agentBuckets,
  onRename,
}: IdentityPanelProps) {
  const resolvedLogo = useResolvedLogo(logoPath);
  const resolved = resolveFromBuckets({ name, colors, typography, heroStatement }, agentBuckets);
  const colours = deriveRevealedPalette(resolved.colors, resolved.palette);
  const typefaces = deriveRevealedTypography(resolved.typography, resolved.typographySource);
  const firstImpression = agentBuckets?.firstImpression?.headline ?? null;
  const firstImpressionStatus = agentBuckets?.sectionStatus.first_impression;
  const hideFirstImpression =
    !firstImpression && (firstImpressionStatus === 'skipped' || firstImpressionStatus === 'error');

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm text-foreground"
      data-testid="brand-dna-identity"
    >
      <div
        className={`grid grid-cols-1 divide-y divide-border/70 lg:divide-x lg:divide-y-0 ${
          hideFirstImpression
            ? 'lg:grid-cols-[minmax(0,1.4fr)_auto_auto]'
            : 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]'
        }`}
      >
        <Subsection className="lg:py-5">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0 rounded-lg bg-muted">
              {resolvedLogo ? (
                <AvatarImage
                  src={resolvedLogo}
                  alt={`${resolved.name || 'brand'} logo`}
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className="rounded-lg bg-muted text-sm font-bold text-foreground">
                {(resolved.name || 'B').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <EditableHeading
                value={resolved.name}
                placeholder="Untitled brand"
                onCommit={onRename}
              />
              {host ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ArrowSquareOut className="h-3 w-3" />
                  {host}
                </div>
              ) : null}
            </div>
          </div>
          {resolved.heroStatement ? (
            <p className="mt-2 text-sm italic leading-relaxed text-muted-foreground">
              &ldquo;{resolved.heroStatement}&rdquo;
            </p>
          ) : null}
          <ProvenanceMark
            field="hero-statement"
            provenance={provenanceOf(resolved.heroStatement, resolved.heroSource)}
            emptyLabel="no statement found"
          />
        </Subsection>

        {hideFirstImpression ? null : (
          <Subsection>
            <SubsectionHeader title="First impression" />
            {firstImpression ? (
              <p className="flex items-start gap-1.5 text-sm italic leading-snug text-foreground">
                <Sparkle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--cs-violet,#5a39ff)]" />
                <span className="min-w-0">{firstImpression}</span>
              </p>
            ) : firstImpressionStatus === 'running' ? (
              <p className="text-sm italic text-muted-foreground">Listening for the hook…</p>
            ) : null}
            {firstImpressionStatus === 'running' ? null : (
              <ProvenanceMark
                field="first-impression"
                provenance={provenanceOf(firstImpression, 'site analysis')}
                emptyLabel="nothing found"
              />
            )}
          </Subsection>
        )}

        <Subsection testId="reveal-palette-section">
          <SubsectionHeader title="Palette" chip={brandIdentityChip} />
          {colours.length > 0 ? (
            <PaletteReadout colours={colours} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No colour read from this brand&apos;s material.
            </p>
          )}
          <ProvenanceMark
            field="palette"
            provenance={provenanceOf(colours, resolved.colorsSource)}
            emptyLabel="nothing found"
          />
        </Subsection>

        {/*
          No `in the engine` badge here, unlike the settings panel: onboarding never reads
          the brand font store (the design system arrives later, and this screen must not
          add a fetch to the run), so what we hold is genuinely UNKNOWN at this point.
          Badging it either way would be the same invention the specimen was.
        */}
        <Subsection testId="reveal-typography">
          <SubsectionHeader title="Typography" chip={brandIdentityChip} />
          <div className="flex gap-5">
            {typefaces.map((typeface) => (
              <TypefaceReadout key={typeface.slot} {...typeface} />
            ))}
          </div>
          <NoSpecimenNote />
        </Subsection>
      </div>

      <div className="border-t border-border/70">
        <Subsection>
          <SubsectionHeader title="Tone of voice" chip={messagingChip} />
          <div className="space-y-3">
            <TonePicker />
            {toneFinding ? <FindingCallout finding={toneFinding} /> : null}
          </div>
        </Subsection>
      </div>
    </div>
  );
}

function Subsection({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={`space-y-2 p-5 ${className ?? ''}`} data-testid={testId}>
      {children}
    </section>
  );
}

function SubsectionHeader({ title, chip }: { title: string; chip?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {chip}
    </div>
  );
}

/** Where a revealed value actually came from. Only these two exist on this screen. */
const SOURCE_SITE = 'site analysis';
const SOURCE_SAVED = 'saved profile';

interface ResolvedIdentity {
  name: string;
  nameSource: string;
  colors: string[];
  /** The roled palette, present only when the value came from the site analysis. */
  palette: WebsitePalette | null;
  colorsSource: string;
  typography: { primary: string | null; secondary: string | null };
  typographySource: string;
  heroStatement: string | null;
  heroSource: string;
}

function derivePaletteArray(palette: WebsitePalette | null | undefined): string[] {
  if (!palette) return [];
  return [
    palette.primary,
    palette.secondary,
    palette.accent,
    palette.background,
    palette.text,
  ].filter((hex): hex is string => Boolean(hex));
}

/**
 * The saved brand profile wins over the live run, and each field remembers which it came
 * from — a panel that shows a value without saying where it read it is the thing this
 * screen was getting wrong.
 */
function resolveFromBuckets(
  brandInputs: {
    name: string;
    colors: string[];
    typography: { primary: string | null; secondary: string | null };
    heroStatement: string | null;
  },
  buckets?: AgentPreviewBuckets | null,
): ResolvedIdentity {
  const fromSite = brandInputs.colors.length === 0;
  const sitePalette = fromSite ? (buckets?.website?.palette ?? null) : null;
  const savedTypography = brandInputs.typography.primary || brandInputs.typography.secondary;

  return {
    name: brandInputs.name || buckets?.brandProfile?.brand_name || '',
    nameSource: brandInputs.name ? SOURCE_SAVED : SOURCE_SITE,
    colors: fromSite ? derivePaletteArray(sitePalette) : brandInputs.colors,
    palette: sitePalette,
    colorsSource: fromSite ? SOURCE_SITE : SOURCE_SAVED,
    typography: savedTypography
      ? brandInputs.typography
      : {
          primary: buckets?.website?.typography?.primary ?? null,
          secondary: buckets?.website?.typography?.secondary ?? null,
        },
    typographySource: savedTypography ? SOURCE_SAVED : SOURCE_SITE,
    heroStatement: brandInputs.heroStatement || buckets?.website?.hero_statement || null,
    heroSource: brandInputs.heroStatement ? SOURCE_SAVED : SOURCE_SITE,
  };
}

function useResolvedLogo(logoPath: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    if (!logoPath) {
      setResolved(null);
      return;
    }
    if (/^https?:\/\//i.test(logoPath)) {
      setResolved(logoPath);
      return;
    }
    let active = true;
    createSignedAssetUrl(logoPath, 3600)
      .then((url) => active && setResolved(url))
      .catch(() => active && setResolved(null));
    return () => {
      active = false;
    };
  }, [logoPath]);
  return resolved;
}
