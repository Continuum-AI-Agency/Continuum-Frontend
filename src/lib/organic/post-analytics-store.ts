import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import * as storeRegistry from '@/lib/storage/storeRegistry';

// In-session cache of per-post insight details so clicking between posts (and
// switching tabs / remounting the dashboard) is instant. The server-side
// Upstash + reporting_cache layer still backs cross-session/user fetches; this
// store is the fast client-local reference layer the user asked for.
//
// Keyed by `${integrationAccountId}:${postId}` so a post's metrics never bleed
// across accounts. Persisted to sessionStorage (tab-scoped) and wiped on brand
// switch, mirroring useCalendarStore.

const STORAGE_KEY = 'organic-post-analytics-storage';
const STORE_VERSION = 1;

export function buildPostDetailKey(integrationAccountId: string, postId: string): string {
  return `${integrationAccountId}:${postId}`;
}

// Re-keys the account-scoped store entries to a plain postId->post record for the
// currently selected account, so consumers can look up details by post id.
export function selectAccountPostDetails(
  postDetailsById: Record<string, OrganicPost>,
  integrationAccountId: string | null,
): Record<string, OrganicPost> {
  if (!integrationAccountId) return {};
  const prefix = `${integrationAccountId}:`;
  const result: Record<string, OrganicPost> = {};
  for (const [key, post] of Object.entries(postDetailsById)) {
    if (key.startsWith(prefix)) result[post.id] = post;
  }
  return result;
}

interface PostAnalyticsState {
  postDetailsById: Record<string, OrganicPost>;
  setPostDetail: (params: { integrationAccountId: string; post: OrganicPost }) => void;
  getPostDetail: (params: {
    integrationAccountId: string;
    postId: string;
  }) => OrganicPost | undefined;
  clearPostDetails: () => void;
  resetForBrandSwitch: () => void;
}

type PersistedPostAnalyticsState = Pick<PostAnalyticsState, 'postDetailsById'>;

// Comment threads can be large; they are not needed for cards/charts/export, so
// strip them before persisting to keep sessionStorage lean.
function stripPostBlobs(post: OrganicPost): OrganicPost {
  if (!post.comments) return post;
  return { ...post, comments: [] };
}

function sanitizePersistedState(
  state: Partial<PostAnalyticsState> | undefined,
): PersistedPostAnalyticsState {
  const source = state?.postDetailsById;
  if (!source || typeof source !== 'object') return { postDetailsById: {} };

  const postDetailsById: Record<string, OrganicPost> = {};
  for (const [key, post] of Object.entries(source)) {
    if (post && typeof post === 'object') {
      postDetailsById[key] = stripPostBlobs(post as OrganicPost);
    }
  }
  return { postDetailsById };
}

export const usePostAnalyticsStore = create<PostAnalyticsState>()(
  persist(
    (set, get) => ({
      postDetailsById: {},

      setPostDetail: ({ integrationAccountId, post }) =>
        set((state) => ({
          postDetailsById: {
            ...state.postDetailsById,
            [buildPostDetailKey(integrationAccountId, post.id)]: post,
          },
        })),

      getPostDetail: ({ integrationAccountId, postId }) =>
        get().postDetailsById[buildPostDetailKey(integrationAccountId, postId)],

      clearPostDetails: () => set({ postDetailsById: {} }),

      resetForBrandSwitch: () => set({ postDetailsById: {} }),
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.sessionStorage : localStorage,
      ),
      partialize: (state) => sanitizePersistedState(state),
      migrate: (persistedState) =>
        sanitizePersistedState(persistedState as Partial<PostAnalyticsState>),
    },
  ),
);

if (typeof window !== 'undefined') {
  storeRegistry.register({
    name: 'organic-post-analytics',
    teardown: () => {
      try {
        usePostAnalyticsStore.getState().resetForBrandSwitch();
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[organic-post-analytics] teardown failed', error);
        }
      }
    },
  });
}
