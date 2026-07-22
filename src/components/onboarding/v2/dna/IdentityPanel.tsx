import { ArrowSquareOut, Sparkle } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createSignedAssetUrl } from '@/lib/creative-assets/storageClient';
import type { ReadinessFinding } from '@/lib/onboarding/agentClient';
import { FindingCallout } from '../readiness/FindingCallout';
import type { AgentPreviewBuckets } from '../state/agentPreview';
import { ColorSwatch } from './ColorSwatch';
import { EditableHeading } from './EditableHeading';
import { FontSample } from './FontSample';
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
  const firstImpression = agentBuckets?.firstImpression?.headline ?? null;
  const firstImpressionStatus = agentBuckets?.sectionStatus.first_impression;
  const hideFirstImpression =
    !firstImpression && (firstImpressionStatus === 'skipped' || firstImpressionStatus === 'error');

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm text-foreground">
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
        </Subsection>

        {hideFirstImpression ? null : (
          <Subsection>
            <SubsectionHeader title="First impression" />
            {firstImpression ? (
              <p className="flex items-start gap-1.5 text-sm italic leading-snug text-foreground">
                <Sparkle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--cs-violet,#5a39ff)]" />
                <span className="min-w-0">{firstImpression}</span>
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">Listening for the hook…</p>
            )}
          </Subsection>
        )}

        <Subsection>
          <SubsectionHeader title="Palette" chip={brandIdentityChip} />
          {resolved.colors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {resolved.colors.map((hex) => (
                <ColorSwatch key={hex} hex={hex} />
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">No palette detected.</p>
          )}
        </Subsection>

        <Subsection>
          <SubsectionHeader title="Typography" chip={brandIdentityChip} />
          {resolved.typography.primary || resolved.typography.secondary ? (
            <div className="flex gap-5">
              <FontSample family={resolved.typography.primary} role="Primary" weight={700} />
              <FontSample family={resolved.typography.secondary} role="Secondary" weight={400} />
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">No fonts detected.</p>
          )}
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

function Subsection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`space-y-2 p-5 ${className ?? ''}`}>{children}</section>;
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

function derivePaletteArray(palette: unknown): string[] {
  if (!palette || typeof palette !== 'object') return [];
  const p = palette as {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
    background?: string | null;
    text?: string | null;
  };
  return [p.primary, p.secondary, p.accent, p.background, p.text].filter((hex): hex is string =>
    Boolean(hex),
  );
}

function resolveFromBuckets(
  brandInputs: {
    name: string;
    colors: string[];
    typography: { primary: string | null; secondary: string | null };
    heroStatement: string | null;
  },
  buckets?: AgentPreviewBuckets | null,
): {
  name: string;
  colors: string[];
  typography: { primary: string | null; secondary: string | null };
  heroStatement: string | null;
} {
  const name = brandInputs.name || buckets?.brandProfile?.brand_name || '';
  const colors =
    brandInputs.colors.length > 0
      ? brandInputs.colors
      : derivePaletteArray(buckets?.website?.palette);
  const typography =
    brandInputs.typography.primary || brandInputs.typography.secondary
      ? brandInputs.typography
      : {
          primary: buckets?.website?.typography?.primary ?? null,
          secondary: buckets?.website?.typography?.secondary ?? null,
        };
  const heroStatement = brandInputs.heroStatement || buckets?.website?.hero_statement || null;
  return { name, colors, typography, heroStatement };
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
