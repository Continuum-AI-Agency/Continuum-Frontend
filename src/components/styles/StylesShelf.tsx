'use client';

import {
  type BrandStyle,
  conceptLengthRule,
  HEADLESS_CONCEPTS,
  HEADLESS_EFFECTS,
} from '@continuum/contracts';

import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useBrandStyles } from '@/hooks/useStylesShelf';
import { useUiErrorMessage } from '@/i18n/errors';
import { cn } from '@/lib/utils';

// Made from the effects bench's frames of the bench tenant's approved actress, and from the
// concept round's accepted reels (public/styles/).
export const effectThumbnail = (effectId: string): string => `/styles/effects/${effectId}.webp`;
export const conceptThumbnail = (conceptId: string): string => `/styles/concepts/${conceptId}.webp`;

type BadgeVariant = 'success' | 'teal' | 'warning' | 'muted';
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  proven: 'success',
  benched: 'teal',
  draft: 'muted',
  approved: 'success',
};

type Chip = { label: string; variant?: BadgeVariant };

type StyleCardProps = {
  label: string;
  whenToUse: string;
  detail: string;
  thumbnail: string | null;
  chips: Chip[];
  actions?: ReactNode;
};

function StyleCard({ label, whenToUse, detail, thumbnail, chips, actions }: StyleCardProps) {
  const [open, setOpen] = useState(false);
  // A thumbnail that fails to load shows the same muted frame as one that has none.
  const [broken, setBroken] = useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex flex-col gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {thumbnail && !broken ? (
          // biome-ignore lint/performance/noImgElement: tiny static webp thumbnails and 1 h signed preview URLs; the optimizer would only re-encode them.
          <img
            src={thumbnail}
            alt=""
            width={270}
            height={480}
            loading="lazy"
            onError={() => setBroken(true)}
            className="aspect-[9/16] w-full rounded-md bg-muted object-cover"
          />
        ) : (
          <div className="aspect-[9/16] w-full rounded-md bg-muted" />
        )}
        <span className="text-sm font-medium leading-tight">{label}</span>
        <span className={cn('text-xs text-muted-foreground', !open && 'line-clamp-2')}>
          {whenToUse}
        </span>
        {open && <span className="text-xs text-foreground/80">{detail}</span>}
      </button>
      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <Badge key={chip.label} variant={chip.variant ?? 'secondary'}>
            {chip.label}
          </Badge>
        ))}
      </div>
      {actions}
    </li>
  );
}

function ShelfSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </header>
      <ul
        aria-label={title}
        className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3"
      >
        {children}
      </ul>
    </section>
  );
}

function brandStyleThumbnail(style: BrandStyle): string | null {
  if (style.previewUrl) return style.previewUrl;
  return style.kind === 'concept_variant' ? conceptThumbnail(style.spec.base) : null;
}

function BrandStyles({ brandId }: { brandId: string }) {
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('common');
  const { styles, isLoading, error, decide, pendingStyleId } = useBrandStyles(brandId);
  const [message, setMessage] = useState('');

  const act = async (style: BrandStyle, decision: 'approve' | 'retire') => {
    try {
      await decide({ styleId: style.id, decision });
      setMessage(`${style.spec.label} ${decision === 'approve' ? 'approved' : 'retired'}.`);
    } catch (cause) {
      setMessage(
        uiText('m_c170f6075f', {
          v0: String(decision),
          v1: String(style.spec.label),
          v2: String(getUiErrorMessage(cause)),
        }),
      );
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-sm font-semibold">{uiText('m_8d64936ff8')}</h2>
        <p className="text-xs text-muted-foreground">{uiText('m_f56137889a')}</p>
      </header>
      <p role="status" className="text-xs text-muted-foreground empty:hidden">
        {message}
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">{uiText('m_415e0a80da')}</p>
      ) : error ? (
        <p role="alert" className="text-xs text-destructive">
          {uiText('m_a0937e83db')}
        </p>
      ) : styles.length === 0 ? (
        <p className="text-xs text-muted-foreground">{uiText('m_8a6ae816d4')}</p>
      ) : (
        <ul
          aria-label={uiText('m_8d64936ff8')}
          className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3"
        >
          {styles.map((style) => {
            const busy = pendingStyleId === style.id;
            return (
              <StyleCard
                key={style.id}
                label={style.spec.label}
                whenToUse={style.spec.whenToUse}
                detail={
                  style.kind === 'effect'
                    ? style.spec.summary
                    : `A way to tell ${style.spec.base}: ${style.spec.guidance.join(' ')}`
                }
                thumbnail={brandStyleThumbnail(style)}
                chips={[
                  {
                    label:
                      style.kind === 'effect' ? uiText('m_720b5dbc53') : uiText('m_5e7653e5d3'),
                  },
                  {
                    label:
                      style.status === 'draft' ? uiText('m_23d33e22ac') : uiText('m_41b81eb8db'),
                    variant: style.status === 'draft' ? 'warning' : 'success',
                  },
                ]}
                actions={
                  <div className="flex gap-1">
                    {style.status === 'draft' && (
                      <Button
                        size="xs"
                        variant="success"
                        disabled={busy}
                        aria-label={uiText('m_60f4f36aa4', { v0: String(style.spec.label) })}
                        onClick={() => act(style, 'approve')}
                      >
                        {uiText('approve_6007acb')}
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      aria-label={uiText('m_518b3be2f7', { v0: String(style.spec.label) })}
                      onClick={() => act(style, 'retire')}
                    >
                      {uiText('retire_da8597f')}
                    </Button>
                  </div>
                }
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The Styles shelf: the 30 catalog effects, the 10 concepts, and the brand's own drafts. */
export function StylesShelf({ brandId, className }: { brandId: string; className?: string }) {
  const uiText = useTranslations('common');
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-6 overflow-y-auto pb-6', className)}>
      <BrandStyles brandId={brandId} />
      <ShelfSection title={uiText('effects_358511c')} hint={uiText('stylesEffectsHint')}>
        {HEADLESS_EFFECTS.map((effect) => (
          <StyleCard
            key={effect.id}
            label={effect.label}
            whenToUse={effect.whenToUse}
            detail={effect.summary}
            thumbnail={effectThumbnail(effect.id)}
            chips={[
              { label: effect.category },
              { label: effect.status, variant: STATUS_VARIANT[effect.status] },
            ]}
          />
        ))}
      </ShelfSection>
      <ShelfSection title={uiText('m_6f58d263f3')} hint={uiText('stylesConceptsHint')}>
        {HEADLESS_CONCEPTS.map((concept) => (
          <StyleCard
            key={concept.id}
            label={concept.label}
            whenToUse={concept.whenToUse}
            detail={`${concept.summary} ${conceptLengthRule(concept)}.`}
            thumbnail={conceptThumbnail(concept.id)}
            chips={[
              {
                label:
                  concept.casting.people === 2 ? uiText('m_f27913e061') : uiText('m_4aaa232360'),
              },
              { label: concept.status, variant: STATUS_VARIANT[concept.status] },
            ]}
          />
        ))}
      </ShelfSection>
    </div>
  );
}
