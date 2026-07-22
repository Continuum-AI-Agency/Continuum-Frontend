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
                Tag accounts to this brand
              </h2>
              <HelpPopover label="What does Continuum read from these accounts?">
                <p className="font-semibold text-foreground">What does Continuum read?</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Meta</span> — ad accounts, pages,
                    and insights from Facebook, Instagram, and Threads.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Google</span> — Google Ads,
                    YouTube, and DV360 accounts plus performance data.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">TikTok</span> — ad accounts and
                    campaign-level metrics.
                  </li>
                </ul>
                <p className="text-[0.75rem] text-muted-foreground">
                  Continuum never reads private messages or posts on your behalf.
                </p>
              </HelpPopover>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Pick the specific accounts this brand should use. You can change this any time in
              Settings.
            </p>
            {assignedCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                disabled={clearing}
                className="mt-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {clearing ? 'Clearing…' : 'Clear all'}
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
              Continue
            </Button>
          </div>
        }
      />
    </div>
  );
}
