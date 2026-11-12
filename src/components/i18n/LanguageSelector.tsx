'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { setUiLocaleAction } from '@/i18n/actions';
import { isUiLocale, uiLocales } from '@/i18n/config';
import { useRouter } from '@/i18n/navigation';

const languageNames = { en: 'English', 'pt-BR': 'Português (Brasil)', es: 'Español' };

export function LanguageSelector({ scope }: { scope: 'account' | 'browser' }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeLanguage(value: unknown) {
    if (!isUiLocale(value) || value === locale) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setUiLocaleAction(value, scope);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError(t('languageSaveFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-xs text-muted-foreground">
        {t('language')}
      </span>
      <RadioGroup
        value={locale}
        onValueChange={changeLanguage}
        disabled={pending}
        aria-labelledby={id}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-busy={pending}
        className="flex flex-wrap gap-x-4 gap-y-2"
      >
        {uiLocales.map((language) => (
          <label
            key={language}
            htmlFor={`${id}-${language}`}
            className="inline-flex items-center gap-2 text-sm"
          >
            <RadioGroupItem id={`${id}-${language}`} value={language} />
            {languageNames[language]}
          </label>
        ))}
      </RadioGroup>
      {pending && (
        <span role="status" className="text-xs text-muted-foreground">
          {t('saving')}
        </span>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
