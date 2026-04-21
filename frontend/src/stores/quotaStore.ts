import { create } from 'zustand';
import { getScopusQuota } from '../api/articles';
import type { QuotaResponse } from '../types/api';

interface QuotaStore {
  quota: QuotaResponse | null;
  isLoading: boolean;
  fetchQuota: () => Promise<void>;
}

export const useQuotaStore = create<QuotaStore>((set) => ({
  quota: null,
  isLoading: false,
  fetchQuota: async () => {
    set({ isLoading: true });
    try {
      const quota = await getScopusQuota();
      set({ quota, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
