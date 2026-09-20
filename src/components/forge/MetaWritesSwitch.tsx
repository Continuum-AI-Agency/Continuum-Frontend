'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { updateBrandMetaWritesAllowedAction } from '@/app/(post-auth)/settings/actions';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * The brand's arming switch for real Meta writes, on the Forge itself.
 *
 * It is the second of the delivery plugin's two switches — the first is the
 * tenant's `dry_run` — and the only one Continuum owns. It sits here rather
 * than in Settings because this is where someone watches a render become an
 * ad, and the question "will this actually publish?" is asked in that moment.
 *
 * Read-only for anyone who is not an owner or admin: RLS refuses their write,
 * so the control says so up front instead of failing after the click.
 */
export function MetaWritesSwitch({
  brandId,
  allowed,
  canEdit,
}: {
  brandId: string;
  allowed: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    startTransition(async () => {
      try {
        await updateBrandMetaWritesAllowedAction(brandId, next);
        show({
          title: next ? 'Meta writes armed' : 'Meta writes disarmed',
          description: next
            ? 'Approved renders for this brand can now be published to its ad account.'
            : 'Approved renders will be previewed and recorded, never published.',
          variant: next ? 'warning' : 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: 'Could not change Meta writes',
          description:
            error instanceof Error ? error.message : 'Only an owner or admin can change this.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium leading-none">Allow real Meta writes</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {allowed
            ? 'Approved renders publish to this brand’s ad account.'
            : 'Approved renders are previewed only — nothing reaches Ads Manager.'}
        </p>
      </div>
      <Switch
        checked={allowed}
        onCheckedChange={handleChange}
        disabled={!canEdit || isPending}
        aria-label="Allow real Meta writes for this brand"
      />
    </div>
  );
}
