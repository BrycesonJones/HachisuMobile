import type { ActivityItem } from '@/types/activity';

// A lightweight in-memory registry of the most recently loaded Activity items,
// keyed by id. The Activity list populates it on every fetch so the detail
// screen can resolve an item by id (mirrors how the mock feed exposed
// getTransactionById). It is intentionally ephemeral — the list is always the
// source, this is just a hop for navigation.
const cache = new Map<string, ActivityItem>();

export function cacheActivityItems(items: ActivityItem[]): void {
  for (const item of items) {
    cache.set(item.id, item);
  }
}

export function getCachedActivityItem(id: string): ActivityItem | undefined {
  return cache.get(id);
}
