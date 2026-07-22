'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { onBrandChange } from '@/lib/brands/brand-switch';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        queryClient.clear();
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
      unsubscribeBrand();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
