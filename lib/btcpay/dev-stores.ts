import type { MerchantStore } from '@/types/merchant-store';

// In-memory store registry for dev-bypass mode (no real Supabase session).
// Mirrors what merchant_stores would hold so the multi-store UI is testable
// without backend access. Reset when the dev session is cleared.

let devStores: MerchantStore[] = [];

export function getDevStores(): MerchantStore[] {
  return devStores;
}

export function addDevStore(store: MerchantStore): MerchantStore {
  devStores = [...devStores, store];
  return store;
}

/** Patches a single dev store by id (used to simulate wallet connection). */
export function updateDevStore(
  id: string,
  updates: Partial<MerchantStore>,
): MerchantStore | null {
  let updated: MerchantStore | null = null;
  devStores = devStores.map((s) => {
    if (s.id !== id) return s;
    updated = { ...s, ...updates, updated_at: new Date().toISOString() };
    return updated;
  });
  return updated;
}

export function clearDevStores(): void {
  devStores = [];
}
