import {
  ArrowUpRight,
  BookOpen,
  Library,
  Link2,
  type LucideIcon,
  Plug,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { GlossaryTooltip } from '@/components/shared/glossary';

// Activation launcher (IMP-017). Pulls the setup actions that are otherwise
// scattered across dense settings tabs — Brand Book, Knowledge, Integrations,
// Connections, competitors — into one "start here" surface. Each card links to
// the existing section; nothing here duplicates those surfaces or their data.

type ActivationTarget = {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  href: string;
  cta: string;
};

function getActivationTargets(tUi: ReturnType<typeof useTranslations<'settings'>>) {
  return [
    {
      icon: Library,
      title: tUi('m_9b1de8ceed'),
      description: tUi('m_8e1a745529'),
      href: '/settings?section=brand-book',
      cta: tUi('m_56e4cfea9d'),
    },
    {
      icon: BookOpen,
      title: tUi('m_dec1fccaba'),
      description: tUi('m_86bf540bdc'),
      href: '/settings?section=knowledge',
      cta: tUi('m_24e9e92419'),
    },
    {
      icon: Plug,
      title: tUi('m_a7881cac6e'),
      description: tUi('m_cd181c9038'),
      href: '/settings?section=integrations',
      cta: tUi('m_4abf45a49c'),
    },
    {
      icon: Target,
      title: tUi('m_855bd26cf4'),
      description: tUi('m_ba8b7d5011'),
      href: '/competitor-spy?tab=competitors',
      cta: tUi('m_5174aa0324'),
    },
  ];
}

function ConnectionsCard() {
  const tUi = useTranslations('settings');

  return (
    <ActivationCard
      icon={Link2}
      title={tUi('m_8f3509b64e')}
      description={
        <>
          {tUi('m_ce1f4c77aa')}
          <GlossaryTooltip termKey="mcp">MCP</GlossaryTooltip> {tUi('m_c64b5c36a0')}
        </>
      }
      href="/settings?section=connections"
      cta={tUi('m_223fb7fa49')}
    />
  );
}

function ActivationCard({ icon: Icon, title, description, href, cta }: ActivationTarget) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-card/20 p-4 transition-colors hover:border-foreground/30 hover:bg-card/40"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <span className="mt-auto inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        {cta}
        <ArrowUpRight className="size-3" aria-hidden />
      </span>
    </Link>
  );
}

export function BrandActivationSection() {
  const tUi = useTranslations('settings');
  const ACTIVATION_TARGETS = getActivationTargets(tUi);

  return (
    <div className="grid grid-cols-1 gap-3 @[32rem]/settings-section:grid-cols-2">
      {ACTIVATION_TARGETS.map((target) => (
        <ActivationCard key={target.href} {...target} />
      ))}
      <ConnectionsCard />
    </div>
  );
}
