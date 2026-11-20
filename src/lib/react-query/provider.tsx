'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createSessionLossGuard } from '@/lib/auth/sessionLoss';
import { onBrandChange } from '@/lib/brands/brand-switch';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { setSignedUrlCacheOwner } from '@/StudioCanvas/utils/signedUrlCache';
import { retryUnlessTimeout } from './retry';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        // Once for an error; never for a timeout (the bound was already the wait).
        retry: retryUnlessTimeout(1),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // A tab learns its session is gone from a failed read or the client's own event, and then
    // leaves for sign-in with nothing of the brand left on screen (sessionLoss.ts).
    const sessionLoss = createSessionLossGuard({
      getSession: async () => {
        const { data, error } = await supabase.auth.getSession();
        // No session WITH an error is a refresh that could not reach the server: unknown.
        return error ? undefined : data.session;
      },
      clearClientData: () => queryClient.clear(),
      leave: (href) => window.location.assign(href),
      currentPath: () => `${window.location.pathname}${window.location.search}`,
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // The canvas keeps signed URLs across reloads for this person only.
      setSignedUrlCacheOwner(session?.user.id ?? null);
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        sessionLoss.onSignedOut();
      }
    });

    const unsubscribeFailedReads = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') {
        void sessionLoss.onReadFailed();
      }
    });

    // On brand switch, refetch instead of clearing. invalidateQueries refetches
    // active queries in the background while keeping the current data on screen
    // (no empty-state flash), and it catches every brand-scoped query — including
    // those whose keys don't embed the brand id, which a brand-id predicate would
    // miss and leave showing the previous brand's data.
    const unsubscribeBrand = onBrandChange(() => {
      void queryClient.invalidateQueries();
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeFailedReads();
      unsubscribeBrand();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
