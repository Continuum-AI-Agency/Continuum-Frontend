'use client';

import { useEffect, useRef, useState } from 'react';
import { CurrentUserAvatar } from '@/components/current-user-avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useCurrentUserAvatar } from '@/hooks/useCurrentUserAvatar';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type UserProfileSectionProps = {
  email: string;
  name: string | null;
  lastSignIn: string | null;
};

export function UserProfileSection({ email, name, lastSignIn }: UserProfileSectionProps) {
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
        title: 'Avatar updated',
        description: 'Your profile image has been refreshed.',
        variant: 'success',
      });
    } catch (error) {
      show({
        title: 'Avatar upload failed',
        description: error instanceof Error ? error.message : 'Could not upload avatar.',
        variant: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formattedLastSignIn = mounted && lastSignIn ? new Date(lastSignIn).toLocaleString() : '—';

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
            {isUploading ? 'Uploading…' : avatarUrl ? 'Change avatar' : 'Upload avatar'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUploadAvatar(e.target.files?.[0])}
          />
          <span className="text-xs text-muted-foreground">PNG, JPG, or GIF. Max 5MB.</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Detail label="Email" value={email} />
        <Detail label="Name" value={name ?? initials ?? '—'} />
        <Detail label="Last sign in" value={formattedLastSignIn} />
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
