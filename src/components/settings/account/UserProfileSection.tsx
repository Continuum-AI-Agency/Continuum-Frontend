'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { CurrentUserAvatar } from '@/components/current-user-avatar';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useCurrentUserAvatar } from '@/hooks/useCurrentUserAvatar';
import { useUiErrorMessage } from '@/i18n/errors';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type UserProfileSectionProps = {
  email: string;
  name: string | null;
  lastSignIn: string | null;
};

export function UserProfileSection({ email, name, lastSignIn }: UserProfileSectionProps) {
  const uiLocale = useLocale();

  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const { show } = useToast();
  const supabase = createSupabaseBrowserClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user, avatarUrl, initials, refresh } = useCurrentUserAvatar();
  const [isUploading, setIsUploading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleUploadAvatar = async (file?: File | null) => {
    if (!file || !user) return;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `avatars/${user.id}-${Date.now()}.${ext}`;
    setIsUploading(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      await supabase.auth.updateUser({ data: { avatar_url: path } });
      await refresh();
      show({
        title: tUi('m_46e014bb01'),
        description: tUi('m_12d6f0510d'),
        variant: 'success',
      });
    } catch (error) {
      show({
        title: tUi('m_835b2ab0d3'),
        description: error instanceof Error ? uiErrorMessage(error) : tUi('m_72f1d9c4ce'),
        variant: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formattedLastSignIn =
    mounted && lastSignIn ? new Date(lastSignIn).toLocaleString(uiLocale) : '—';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <CurrentUserAvatar size={64} />
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={isUploading || !user}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading
              ? tUi('m_d921a79afa')
              : avatarUrl
                ? tUi('m_60f2e98ebe')
                : tUi('m_eb634e962b')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUploadAvatar(e.target.files?.[0])}
          />
          <span className="text-xs text-muted-foreground">{tUi('m_8437665d25')}</span>
        </div>
      </div>
      <LanguageSelector scope="account" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Detail label={tUi('m_84add5b295')} value={email} />
        <Detail label={tUi('m_709a23220f')} value={name ?? initials ?? '—'} />
        <Detail label={tUi('m_a21f88b1fd')} value={formattedLastSignIn} />
      </div>
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
