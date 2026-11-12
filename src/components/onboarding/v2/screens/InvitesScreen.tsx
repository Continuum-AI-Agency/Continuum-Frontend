import { Users } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';

import { TeamInviteSection } from '../dna/TeamInviteSection';
import { HelpPopover } from '../HelpPopover';

type InvitesScreenProps = {
  totalSteps: number;
};

export function InvitesScreen({ totalSteps }: InvitesScreenProps) {
  const tUi = useTranslations('onboarding');

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_22%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
            <Users className="h-3 w-3" />
            {tUi('m_1a344ef7b6')}
            {totalSteps}
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-foreground md:text-[2.5rem]">
              {tUi('m_722fe78c34')}
            </h1>
            <HelpPopover label={tUi('m_8fd8ee6961')}>
              <p className="font-semibold text-foreground">{tUi('m_47dcc27d6e')}</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">{tUi('m_4e7afebcfb')}</span>
                  {tUi('m_fe170b6420')}
                </li>
                <li>
                  <span className="font-medium text-foreground">{tUi('m_d0e687b079')}</span>
                  {tUi('m_52a6ef9791')}
                </li>
                <li>
                  <span className="font-medium text-foreground">{tUi('m_dbad9f126b')}</span>
                  {tUi('m_bba044fca5')}
                </li>
              </ul>
            </HelpPopover>
          </div>
          <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">
            {tUi('m_408095b051')}
          </p>
        </div>

        <TeamInviteSection />
      </div>
    </div>
  );
}
