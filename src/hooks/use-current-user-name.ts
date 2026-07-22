import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const useCurrentUserName = () => {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfileName = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error(error);
      }

      setName(data.session?.user.user_metadata.full_name ?? '?');
    };

    fetchProfileName();
  }, []);

  return name || '?';
};
