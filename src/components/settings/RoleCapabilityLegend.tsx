'use client';

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

const ROLE_CAPABILITIES: readonly RoleCapability[] = [
  {
    role: 'Owner',
    summary: 'Full control of the brand, including billing and deletion.',
    boundary: 'Owners cannot be removed, and at least one owner must always remain.',
  },
  {
    role: 'Admin',
    summary: 'Manage members, edit settings, connect integrations, and run everything.',
    boundary: 'Can perform destructive actions such as removing members or deleting the brand.',
  },
  {
    role: 'Operator',
    summary: 'Do the day-to-day work — generate content and set the ad naming convention.',
    boundary: 'Cannot manage members, change roles, or delete the brand.',
  },
  {
    role: 'Viewer',
    summary: 'See brand data, insights, and reports.',
    boundary: 'Read-only — cannot change settings, members, or content.',
  },
];

export function RoleCapabilityLegend() {
  return (
    <TooltipProvider delay={150}>
      <div className="rounded-lg border border-border/60 bg-card/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What each role can do
          </h3>
          <Link
            href="/settings?section=activity"
            className="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ScrollText className="size-3" aria-hidden />
            Review activity log
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
                        aria-label={`${capability.role} permission boundary`}
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
