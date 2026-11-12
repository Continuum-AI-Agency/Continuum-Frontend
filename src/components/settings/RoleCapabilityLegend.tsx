'use client';
import { useTranslations } from 'next-intl';

// Plain-English explanation of what each brand role can and cannot do (IMP-019
// copy). Sits under the members list so admins can see exactly who can view data
// and who can act before they change a role. Copy + tooltip only — the security
// lane owns the actual RBAC enforcement; this component never changes behaviour.

import { Info, ScrollText } from 'lucide-react';
import Link from 'next/link';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type RoleCapability = {
  role: string;
  summary: string;
  boundary: string;
};

function getRoleCapabilities(tUi: ReturnType<typeof useTranslations<'settings'>>) {
  return [
    {
      role: tUi('m_89ff31225c'),
      summary: tUi('m_92bc5196d3'),
      boundary: tUi('m_ba9783c2f7'),
    },
    {
      role: tUi('m_4e7afebcfb'),
      summary: tUi('m_7ec35a9c9c'),
      boundary: tUi('m_5a307b01c2'),
    },
    {
      role: tUi('m_d0e687b079'),
      summary: tUi('m_77143beeab'),
      boundary: tUi('m_25fee65905'),
    },
    {
      role: tUi('m_dbad9f126b'),
      summary: tUi('m_8b8955c1ab'),
      boundary: tUi('m_32c5d82314'),
    },
  ];
}

export function RoleCapabilityLegend() {
  const tUi = useTranslations('settings');

  const ROLE_CAPABILITIES = getRoleCapabilities(tUi);

  return (
    <TooltipProvider delay={150}>
      <div className="rounded-lg border border-border/60 bg-card/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tUi('m_679a25426e')}
          </h3>
          <Link
            href="/settings?section=activity"
            className="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ScrollText className="size-3" aria-hidden />
            {tUi('m_a5b388965c')}
          </Link>
        </div>
        <dl className="space-y-2">
          {ROLE_CAPABILITIES.map((capability) => (
            <div key={capability.role} className="flex items-start gap-2 text-xs">
              <dt className="w-16 shrink-0 font-medium text-foreground">{capability.role}</dt>
              <dd className="flex min-w-0 flex-1 items-start gap-1 text-muted-foreground">
                <span className="min-w-0">{capability.summary}</span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={tUi('m_e7c4f3db23', {
                          v0: String(capability.role),
                        })}
                        className="mt-0.5 shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground"
                      >
                        <Info className="size-3" aria-hidden />
                      </button>
                    }
                  />
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">{capability.boundary}</p>
                  </TooltipContent>
                </Tooltip>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </TooltipProvider>
  );
}
