import { useTranslations } from 'next-intl';
import {
  type AssignerTrackEvent,
  BrandAssetAssigner,
} from '@/components/integrations/BrandAssetAssigner';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { Button } from '@/components/ui/button';
import { type OnboardingEventName, trackOnboardingEvent } from '@/lib/onboarding/telemetry';

import { HelpPopover } from '../HelpPopover';

type IntegrationsScreenProps = {
  onAdvance: () => void;
};

const ONBOARDING_EVENT_BY_ASSIGNER_EVENT: Record<AssignerTrackEvent, OnboardingEventName> = {
  asset_assigned: 'onboarding_asset_assigned',
  asset_unassigned: 'onboarding_asset_unassigned',
  assets_cleared: 'onboarding_assets_cleared',
  oauth_started: 'onboarding_oauth_started',
  oauth_completed: 'onboarding_oauth_completed',
  oauth_failed: 'onboarding_oauth_failed',
};

export function IntegrationsScreen({ onAdvance }: IntegrationsScreenProps) {
  const tUi = useTranslations('onboarding');

  const { brandId } = useOnboarding();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 md:px-8">
      <BrandAssetAssigner
        brandId={brandId}
        onTrack={(event, payload) =>
          trackOnboardingEvent(ONBOARDING_EVENT_BY_ASSIGNER_EVENT[event], payload)
        }
        renderHeader={({ assignedCount, clearAll, clearing }) => (
          <header className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {tUi('m_40f49fb0be')}
              </h2>
              <HelpPopover label={tUi('m_d1ee031968')}>
                <p className="font-semibold text-foreground">{tUi('m_0eb7c44b8e')}</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Meta</span>
                    {tUi('m_ab49ae3ef7')}
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Google</span>
                    {tUi('m_3d9e9fa6d9')}
                  </li>
                  <li>
                    <span className="font-medium text-foreground">TikTok</span>
                    {tUi('m_4dd927c683')}
                  </li>
                </ul>
                <p className="text-[0.75rem] text-muted-foreground">{tUi('m_04cc0494a9')}</p>
              </HelpPopover>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{tUi('m_83f03bc191')}</p>
            {assignedCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                disabled={clearing}
                className="mt-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {clearing ? tUi('m_bc7a2b5869') : tUi('m_c043160a89')}
              </button>
            )}
          </header>
        )}
        footer={
          <div className="flex flex-col items-center gap-2 pt-1">
            <Button
              variant="link"
              size="sm"
              onClick={onAdvance}
              className="text-muted-foreground hover:text-foreground"
            >
              {tUi('m_2e02623966')}
            </Button>
          </div>
        }
      />
    </div>
  );
}
