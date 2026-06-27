import type { PosApp } from '@/types/pos-app';

// In-memory POS app registry for dev-bypass mode (no real Supabase session).
// Mirrors merchant_pos_apps so the POS UI is testable without backend access.
// Reset when the dev session is cleared.

let devPosApps: PosApp[] = [];

export function getDevPosApps(): PosApp[] {
  return devPosApps;
}

export function getDevPosApp(id: string): PosApp | undefined {
  return devPosApps.find((a) => a.id === id);
}

export function addDevPosApp(app: PosApp): PosApp {
  devPosApps = [...devPosApps, app];
  return app;
}

export function updateDevPosApp(id: string, updates: Partial<PosApp>): PosApp | null {
  let updated: PosApp | null = null;
  devPosApps = devPosApps.map((a) => {
    if (a.id !== id) return a;
    updated = { ...a, ...updates, updated_at: new Date().toISOString() };
    return updated;
  });
  return updated;
}

export function removeDevPosApp(id: string): void {
  devPosApps = devPosApps.filter((a) => a.id !== id);
}

export function clearDevPosApps(): void {
  devPosApps = [];
}
