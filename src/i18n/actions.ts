'use server';

import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isUiLocale } from './config';
import { getCookieLocale, setLocaleCookie } from './server';

export async function setUiLocaleAction(
  input: unknown,
  scope: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const t = await getTranslations({ locale: await getCookieLocale(), namespace: 'common' });
  if (!isUiLocale(input) || (scope !== 'account' && scope !== 'browser')) {
    return { success: false, error: t('languageSaveFailed') };
  }

  try {
    if (scope === 'account') {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.getClaims();
      if (error || !data?.claims?.sub) {
        return { success: false, error: t('languageSaveFailed') };
      }
      const { error: saveError } = await supabase.auth.updateUser({ data: { ui_locale: input } });
      if (saveError) return { success: false, error: t('languageSaveFailed') };
    }
    await setLocaleCookie(input);
    return { success: true };
  } catch {
    return { success: false, error: t('languageSaveFailed') };
  }
}
