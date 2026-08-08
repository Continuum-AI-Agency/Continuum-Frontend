// First-run workflow map (IMP-015). The product spans brand intelligence,
// organic, paid, creative, competitors, and agents; each tab reads alone but the
// system loop is never explained. This renders the loop as a navigable map so a
// new customer sees how the pieces connect: Set brand context -> Connect data ->
// Discover signals -> Generate content -> Measure -> Optimize. The first two
// nodes reflect real setup signals (done vs todo); the rest are navigational.

import { Check, ChevronRight, Circle } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { DashboardSetupState } from './setupState';
import { ORGANIC_HREF, SETTINGS_BRAND_BOOK_HREF, SETTINGS_INTEGRATIONS_HREF } from './setupState';

type WorkflowNode = {
  key: string;
  title: string;
  description: string;
  href: string;
  done?: boolean;
};

function buildNodes(setup: DashboardSetupState): WorkflowNode[] {
  return [
    {
      key: 'brand-context',
      title: 'Set brand context',
      description: 'Generate your Brand Book',
      href: SETTINGS_BRAND_BOOK_HREF,
      done: setup.brandBookReady,
    },
    {
      key: 'connect-data',
      title: 'Connect data',
      description: 'Link and assign accounts',
      href: SETTINGS_INTEGRATIONS_HREF,
      done: setup.hasConnectedData,
    },
    {
      key: 'discover-signals',
      title: 'Discover signals',
      description: 'Trends and competitors',
      href: `${ORGANIC_HREF}?tab=metrics`,
    },
    {
      key: 'generate-content',
      title: 'Generate content',
      description: 'Plan and draft posts',
      href: ORGANIC_HREF,
    },
    {
      key: 'measure',
      title: 'Measure',
      description: 'Track performance',
      href: '/dashboard',
    },
    {
      key: 'optimize',
      title: 'Optimize',
      description: 'Scale what works',
      href: '/scale',
    },
  ];
}

function WorkflowMapNode({ node }: { node: WorkflowNode }) {
  return (
    <Link
      href={node.href}
      data-testid={`workflow-node-${node.key}`}
      aria-label={`${node.title}: ${node.done ? 'done' : 'to do'}. ${node.description}`}
      className={cn(
        'group flex min-w-[9.5rem] flex-1 flex-col rounded-md border px-3 py-2 transition-colors',
        node.done
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-border/70 bg-background hover:border-border hover:bg-muted/40',
      )}
    >
      <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
        {node.done ? (
          <Check aria-hidden className="size-3 text-emerald-600" />
        ) : (
          <Circle aria-hidden className="size-3 text-muted-foreground" />
        )}
        {node.title}
      </span>
      <span className="text-[11px] text-muted-foreground">{node.description}</span>
    </Link>
  );
}

export function FirstRunWorkflowMap({ setup }: { setup: DashboardSetupState }) {
  const nodes = buildNodes(setup);
  return (
    <section
      aria-label="How Continuum works"
      data-testid="dashboard-workflow-map"
      className="p-[var(--card-pad)]"
    >
      <h2 className="text-sm font-semibold tracking-tight text-foreground">How Continuum works</h2>
      <p className="text-xs text-muted-foreground">The loop your workspace runs on.</p>
      <ol className="mt-3 flex flex-wrap items-stretch gap-1.5">
        {nodes.map((node, index) => (
          <li key={node.key} className="flex flex-1 items-center gap-1.5">
            <WorkflowMapNode node={node} />
            {index < nodes.length - 1 ? (
              <ChevronRight
                aria-hidden="true"
                className="hidden size-3.5 shrink-0 text-muted-foreground/50 lg:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
