'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import {
  renameBrandProfileAction,
  updateBrandContentLanguageAction,
  updateBrandTimezoneAction,
} from '@/app/[locale]/(post-auth)/settings/actions';
import { TimezoneCombobox } from '@/components/automations/AutomationBuilder/TimezoneCombobox';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { SettingsLogoUploader } from '../SettingsLogoUploader';

type BrandProfileMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

type BrandIdentitySectionProps = {
  brandName: string;
  logoPath: string | null;
  profile?: BrandProfileMeta;
  canEdit: boolean;
  /** Null when nothing is pinned yet — the backend then detects it from the brand's
   *  own posts on the next generation and writes the answer back here. */
  contentLanguage?: string | null;
  timezone?: string;
};

export function BrandIdentitySection({
  brandName: initialName,
  logoPath,
  profile,
  canEdit,
  contentLanguage: initialLanguage = null,
  timezone: initialTimezone = 'UTC',
}: BrandIdentitySectionProps) {
  const uiLocale = useLocale();
  const languageListId = useId();
  const languageSuggestions = useMemo(() => contentLanguageSuggestions(uiLocale), [uiLocale]);

  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const { show } = useToast();
  const { activeBrandId, updateBrandName } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [brandName, setBrandName] = useState(initialName);
  const [contentLanguage, setContentLanguage] = useState(initialLanguage ?? '');
  const [timezone, setTimezone] = useState(initialTimezone);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setBrandName(initialName);
  }, [initialName]);

  useEffect(() => {
    setContentLanguage(initialLanguage ?? '');
  }, [initialLanguage]);

  useEffect(() => {
    setTimezone(initialTimezone);
  }, [initialTimezone]);

  const handleTimezoneSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        await updateBrandTimezoneAction(activeBrandId, timezone);
        show({
          title: tUi('brandTimezoneSaved'),
          description: tUi('brandTimezoneSavedDescription', { timezone }),
          variant: 'success',
        });
      } catch (error) {
        show({
          title: tUi('brandTimezoneSaveFailed'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_78f9b86ec5'),
          variant: 'error',
        });
      }
    });
  };

  const handleLanguageSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        await updateBrandContentLanguageAction(activeBrandId, contentLanguage);
        show({
          title: tUi('m_9953412879'),
          description: contentLanguage.trim()
            ? tUi('m_f86b975dfd', { v0: String(contentLanguage.trim()) })
            : tUi('m_1e7cef9323'),
          variant: 'success',
        });
      } catch (error) {
        show({
          title: tUi('m_72bf415ad7'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_78f9b86ec5'),
          variant: 'error',
        });
      }
    });
  };

  const dates = useMemo(() => {
    if (!profile || !mounted) return null;
    return {
      createdAt: new Date(profile.createdAt).toLocaleString(uiLocale),
      updatedAt: new Date(profile.updatedAt).toLocaleString(uiLocale),
    };
  }, [profile, mounted, uiLocale]);

  const handleRename = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = brandName.trim();
    if (!trimmed) {
      show({ title: tUi('m_3cb8eeb8a4'), description: tUi('m_21f57ca992'), variant: 'error' });
      return;
    }
    startTransition(async () => {
      try {
        await renameBrandProfileAction(activeBrandId, trimmed);
        setBrandName(trimmed);
        updateBrandName(activeBrandId, trimmed);
        show({ title: tUi('m_269b76042f'), description: tUi('m_1617199c0d'), variant: 'success' });
      } catch (error) {
        show({
          title: tUi('m_85aa47dd98'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_e3cc08251b'),
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleRename}>
        <div className="flex flex-wrap items-start gap-8">
          <SettingsLogoUploader
            brandId={activeBrandId}
            brandName={brandName}
            initialLogoPath={logoPath}
            disabled={!canEdit}
          />
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder={tUi('m_6b4b8b5df0')}
                className="min-w-[260px]"
                disabled={!canEdit}
              />
              <Button type="submit" disabled={isPending || !canEdit}>
                {tUi('m_8ce686405a')}
              </Button>
            </div>
            {profile ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Detail label={tUi('m_accf40c89b')} value={dates?.createdAt ?? '—'} />
                <Detail label={tUi('m_583c9e2357')} value={dates?.updatedAt ?? '—'} />
              </div>
            ) : null}
          </div>
        </div>
      </form>

      <form onSubmit={handleLanguageSave}>
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-sm font-medium">{tUi('m_9dc8357635')}</span>
            <p className="text-xs text-muted-foreground">{tUi('m_7903c85743')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={contentLanguage}
              onChange={(event) => setContentLanguage(event.target.value)}
              placeholder={tUi('m_a2fd122ff6')}
              className="min-w-[260px]"
              disabled={!canEdit}
              list={languageListId}
            />
            <datalist id={languageListId}>
              {languageSuggestions.map((language) => (
                <option key={language} value={language} />
              ))}
            </datalist>
            <Button type="submit" variant="outline" disabled={isPending || !canEdit}>
              {tUi('m_af5a1075cf')}
            </Button>
          </div>
        </div>
      </form>

      <form onSubmit={handleTimezoneSave}>
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-sm font-medium">{tUi('brandTimezoneLabel')}</span>
            <p className="text-xs text-muted-foreground">{tUi('brandTimezoneHelp')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[260px]">
              <TimezoneCombobox value={timezone} onChange={setTimezone} disabled={!canEdit} />
            </div>
            <Button type="submit" variant="outline" disabled={isPending || !canEdit}>
              {tUi('brandTimezoneSave')}
            </Button>
          </div>
        </div>
      </form>

      {!canEdit ? (
        <Alert className="border-warning/30 bg-warning/10">
          <AlertDescription className="text-warning">{tUi('m_953ebfa711')}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

// Suggestions, not a closed list: the field is free text because 'Spanish (Colombia)' and
// 'Spanish (Argentina, voseo)' are different instructions to the copywriter.
const SUGGESTED_CONTENT_LANGUAGES = ['es-CO', 'es-MX', 'es', 'en-US', 'en-GB', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];

function contentLanguageSuggestions(uiLocale: string): string[] {
  try {
    const names = new Intl.DisplayNames([uiLocale], { type: 'language' });
    return SUGGESTED_CONTENT_LANGUAGES.map((code) => names.of(code) ?? code);
  } catch {
    return SUGGESTED_CONTENT_LANGUAGES;
  }
}
