'use client';

// The brand's DEFAULT posting account per platform: the one NEW drafts are stamped with. It never
// changes an existing draft — that is the review panel's identity row, per draft.
//
// One control per platform with at least one account, even a single one, so the planner always
// says where new posts go (A7). The trigger is named "Default <Platform> account: <name>"; its
// popup is the shared AccountPicker (role="radiogroup" named "New <Platform> posts go to",
// role="radio" items), where an account that needs reconnecting is disabled with "Reconnect".

import { PUBLISH_PLATFORM_LABELS, PUBLISH_PLATFORM_ORDER } from '@continuum/contracts';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  accountName,
  accountsForPlatform,
  findAccount,
  usePublishAccounts,
  useSaveDefaultAccount,
} from '@/lib/organic/publishTargets';
import { useCalendarStore } from '@/lib/organic/store';
import { AccountPicker } from './DraftReviewChrome';
import { PlatformIcon } from './PlatformSelector';

export function PlannerAccountSwitcher() {
  const accounts = usePublishAccounts();
  const storeDefaults = useCalendarStore((state) => state.accountContext.accountIds);
  const saveDefault = useSaveDefaultAccount();

  const platforms = PUBLISH_PLATFORM_ORDER.filter(
    (platform) => accountsForPlatform(accounts, platform).length > 0,
  );
  if (platforms.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {platforms.map((platform) => {
        const label = PUBLISH_PLATFORM_LABELS[platform];
        const options = accountsForPlatform(accounts, platform);
        const current =
          options.find((account) => account.isDefault) ??
          findAccount(options, storeDefaults[platform]);
        const name = current ? accountName(current) : null;
        return (
          <AccountPicker
            key={platform}
            accounts={options}
            selectedAccountId={current?.id ?? null}
            onSelect={(accountId) => saveDefault(platform, accountId)}
            groupLabel={`New ${label} posts go to`}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                aria-label={`Default ${label} account: ${name ?? 'Choose account'}`}
              >
                <PlatformIcon platform={platform} className="size-3.5" />
                <span className="max-w-32 truncate font-medium">{name ?? 'Choose account'}</span>
                <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
              </Button>
            }
          />
        );
      })}
    </div>
  );
}
