import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type State = {
  selections: Record<string, string>;
  setSelection: (brandId: string, platform: string, accountId: string) => void;
  getSelection: (brandId: string, platform: string) => string | null;
};

export const useAccountSelectionStore = create<State>()(
  persist(
    (set, get) => ({
      selections: {},
      setSelection: (brandId, platform, accountId) =>
        set((s) => ({
          selections: { ...s.selections, [`${brandId}:${platform}`]: accountId },
        })),
      getSelection: (brandId, platform) => get().selections[`${brandId}:${platform}`] ?? null,
    }),
    {
      name: 'continuum-account-selection',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
