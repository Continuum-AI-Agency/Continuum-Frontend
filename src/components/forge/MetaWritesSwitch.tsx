'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import { useTransition } from 'react';
import { updateBrandMetaWritesAllowedAction } from '@/app/[locale]/(post-auth)/settings/actions';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';

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
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    startTransition(async () => {
      try {
        await updateBrandMetaWritesAllowedAction(brandId, next);
        show({
          title: next
            ? translateUi('meta_writes_armed_fed06a66')
            : translateUi('meta_writes_disarmed_74fc95d3'),
          description: next
            ? translateUi('approved_renders_for_this_brand_can_b8a5cef4')
            : translateUi('approved_renders_will_be_previewed__e061dcc6'),
          variant: next ? 'warning' : 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: translateUi('could_not_change_meta_writes_abfa93f7'),
          description: uiErrorText(error),
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium leading-none">
          {translateUi('allow_real_meta_writes_daeb0841')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {allowed
            ? translateUi('approved_renders_publish_to_this_br_64b42e67')
            : translateUi('approved_renders_are_previewed_only_2588ddad')}
        </p>
      </div>
      <Switch
        checked={allowed}
        onCheckedChange={handleChange}
        disabled={!canEdit || isPending}
        aria-label={translateUi('allow_real_meta_writes_for_this_bra_507dcd4c')}
      />
    </div>
  );
}
