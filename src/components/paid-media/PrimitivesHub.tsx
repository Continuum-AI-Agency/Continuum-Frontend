'use client';

import {
  ArrowLeftIcon,
  Component1Icon,
  FileTextIcon,
  MixerHorizontalIcon,
  PersonIcon,
} from '@radix-ui/react-icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import type { BrandGuidelineSummary } from '@/lib/schemas/brandGuidelines';
import type { BrandInsightsQuestionsByNiche } from '@/lib/schemas/brandInsights';
import { AudienceBuilderPrimitive } from './primitives/AudienceBuilderPrimitive';
import { BrandGuidelinesPrimitive } from './primitives/Brand-Guidelines/BrandGuidelinesPrimitive';
import { BrandPersonasPrimitive } from './primitives/BrandPersonasPrimitive';
import { ProductCatalogManagerPrimitive } from './primitives/ProductCatalogManagerPrimitive';

type PrimitiveId = 'audience' | 'guidelines' | 'catalogs' | 'personas';

type PrimitiveCardConfig = {
  id: PrimitiveId;
  title: string;
  status: 'coming-soon' | 'under-construction';
  summary: string;
  icon: ReactElement;
  accent: string;
};

const primitiveCards: PrimitiveCardConfig[] = [
  {
    id: 'audience',
    title: 'Audience Builder',
    status: 'under-construction',
    summary: 'Reusable, dual-layer audience presets that stay compatible with Meta and Google.',
    icon: <MixerHorizontalIcon />,
    accent: 'linear-gradient(135deg, rgba(139,92,246,0.42), rgba(59,130,246,0.34))',
  },
  {
    id: 'guidelines',
    title: 'Brand Guidelines',
    status: 'under-construction',
    summary: 'Purpose-driven brand books with approvals, tags, and reusable context.',
    icon: <FileTextIcon />,
    accent: 'linear-gradient(135deg, rgba(34,197,94,0.32), rgba(59,130,246,0.28))',
  },
  {
    id: 'catalogs',
    title: 'Product Catalog Manager',
    status: 'under-construction',
    summary: 'Catalog CRUD for DCO feeds, ad-object mapping, and product-tagging metric integrity.',
    icon: <Component1Icon />,
    accent: 'linear-gradient(135deg, rgba(99,102,241,0.40), rgba(16,185,129,0.34))',
  },
  {
    id: 'personas',
    title: 'Brand Personas',
    status: 'coming-soon',
    summary: 'Living personas that align creative tone, targeting, and narrative arcs.',
    icon: <PersonIcon />,
    accent: 'linear-gradient(135deg, rgba(244,114,182,0.32), rgba(59,130,246,0.28))',
  },
];

function GlassCardButton({
  config,
  onSelect,
  disabled,
}: {
  config: PrimitiveCardConfig;
  onSelect: (id: PrimitiveId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="glass-panel relative h-full overflow-hidden rounded-lg shadow-brand-glow transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl">
      {!disabled && <span className="sr-only">{config.title} card</span>}
      {config.status === 'coming-soon' && (
        <div className="pointer-events-none absolute -right-7 -top-1 rotate-6 bg-red-500 text-white text-xs font-semibold px-12 py-1.5 shadow-lg">
          Coming soon
        </div>
      )}
      <button
        type="button"
        onClick={() => !disabled && onSelect(config.id)}
        disabled={disabled}
        className="flex h-full w-full flex-col gap-4 rounded-lg p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg"
              style={{ backgroundImage: config.accent, color: 'var(--foreground)' }}
            >
              {config.icon}
            </div>
            <h4 className="text-lg font-semibold text-white">{config.title}</h4>
          </div>
          <Pill variant={config.status === 'under-construction' ? 'warning' : 'muted'}>
            {config.status === 'under-construction' ? 'Under construction' : 'Coming soon'}
          </Pill>
        </div>
        <span className="text-muted-foreground">{config.summary}</span>
        <div
          className="mt-auto h-28 w-full overflow-hidden rounded-lg border border-[var(--glass-border)]"
          style={{
            backgroundImage: `${config.accent}, radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 40%)`,
            boxShadow: 'var(--glass-shadow)',
          }}
          aria-hidden
        />
      </button>
    </div>
  );
}

type PrimitivesHubProps = {
  brandId: string;
  initialGuidelines?: BrandGuidelineSummary[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  questionsError?: string | null;
};

const EMPTY_QUESTIONS_BY_NICHE: BrandInsightsQuestionsByNiche = {
  questionsByNiche: {},
  status: undefined,
  summary: undefined,
  generatedAt: undefined,
};

const TAB_TO_PRIMITIVE_ID: Record<string, PrimitiveId> = {
  audience: 'audience',
  audiences: 'audience',
  guidelines: 'guidelines',
  personas: 'personas',
  persona: 'personas',
  catalogs: 'catalogs',
  products: 'catalogs',
  'product-catalogs': 'catalogs',
};

const PRIMITIVE_ID_TO_TAB: Record<PrimitiveId, string> = {
  audience: 'audiences',
  guidelines: 'guidelines',
  catalogs: 'products',
  personas: 'personas',
};

export function PrimitivesHub({
  brandId,
  initialGuidelines,
  questionsByNiche,
  questionsError,
}: PrimitivesHubProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeQuestionsByNiche = questionsByNiche ?? EMPTY_QUESTIONS_BY_NICHE;
  const [active, setActive] = useState<PrimitiveId | null>(null);
  const tabValue = searchParams.get('tab');
  const activeFromUrl = useMemo(() => {
    if (!tabValue) return null;
    return TAB_TO_PRIMITIVE_ID[tabValue.toLowerCase()] ?? null;
  }, [tabValue]);

  useEffect(() => {
    setActive(activeFromUrl);
  }, [activeFromUrl]);

  const setActiveWithUrl = (nextActive: PrimitiveId | null) => {
    setActive(nextActive);
    const params = new URLSearchParams(searchParams.toString());
    if (!nextActive) {
      params.delete('tab');
    } else {
      params.set('tab', PRIMITIVE_ID_TO_TAB[nextActive]);
    }
    const nextQuery = params.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const activeCard = primitiveCards.find((card) => card.id === active);

  return (
    <div className="glass-panel w-full rounded-lg p-[var(--card-pad)] shadow-brand-glow">
      {active ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveWithUrl(null)}
              className="bg-transparent text-slate-200 hover:bg-white/5"
            >
              <ArrowLeftIcon /> Back
            </Button>
            <Pill variant={activeCard?.status === 'under-construction' ? 'warning' : 'muted'}>
              {activeCard?.status === 'under-construction' ? 'Under construction' : 'Coming soon'}
            </Pill>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundImage: activeCard?.accent, color: 'var(--foreground)' }}
            >
              {activeCard?.icon}
            </div>
            <div>
              <h5 className="text-xl font-semibold text-white">{activeCard?.title}</h5>
              <span className="text-sm text-muted-foreground">{activeCard?.summary}</span>
            </div>
          </div>

          {active === 'audience' ? (
            <AudienceBuilderPrimitive
              questionsByNiche={safeQuestionsByNiche}
              questionsError={questionsError}
            />
          ) : active === 'guidelines' ? (
            <BrandGuidelinesPrimitive brandId={brandId} initialGuidelines={initialGuidelines} />
          ) : active === 'catalogs' ? (
            <ProductCatalogManagerPrimitive brandId={brandId} />
          ) : (
            <BrandPersonasPrimitive />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {primitiveCards.map((card) => (
              <GlassCardButton
                key={card.id}
                config={card}
                onSelect={setActiveWithUrl}
                disabled={card.status === 'coming-soon'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
