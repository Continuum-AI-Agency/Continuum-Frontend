import { Users } from "@phosphor-icons/react";

import { TeamInviteSection } from "../dna/TeamInviteSection";
import { HelpPopover } from "../HelpPopover";

type InvitesScreenProps = {
  totalSteps: number;
};

export function InvitesScreen({ totalSteps }: InvitesScreenProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_22%,transparent)] bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_8%,transparent)] px-3 py-1 text-[11px] font-semibold text-[var(--cs-violet,#5a39ff)]">
            <Users className="h-3 w-3" />
            Step 4 of {totalSteps}
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-foreground md:text-[2.5rem]">
              Invite your team
            </h1>
            <HelpPopover label="What do the roles mean?">
              <p className="font-semibold text-foreground">Roles</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Admin</span> —
                  full access plus billing and team management.
                </li>
                <li>
                  <span className="font-medium text-foreground">Operator</span>{" "}
                  — can plan, launch, and analyze campaigns.
                </li>
                <li>
                  <span className="font-medium text-foreground">Viewer</span> —
                  read-only access to dashboards.
                </li>
              </ul>
            </HelpPopover>
          </div>
          <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">
            Optional. Send magic-link invites now or add teammates from Settings
            later.
          </p>
        </div>

        <TeamInviteSection />
      </div>
    </div>
  );
}
