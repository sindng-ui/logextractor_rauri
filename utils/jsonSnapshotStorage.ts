import { JsonSnapshotItem } from '../types/jsonBeautify';
import { deleteStoredValue, getStoredValue, setStoredValue } from './db';

export const MAX_JSON_SNAPSHOTS = 5;
export const MAX_PERSIST_SNAPSHOT_BYTES = 5 * 1024 * 1024; // 5MB per snapshot safety cap

const META_KEY = 'json_beautify_snapshots_meta';
const rawKey = (id: string) => `json_beautify_snapshot_raw_${id}`;

interface PersistedMetaPayload {
  items: JsonSnapshotItem[];
  activeId: string | null;
}

// In-memory fallback for oversized (>5MB) session-only snapshots
const sessionOnlyRawMap = new Map<string, string>();

export async function loadSnapshotMeta(): Promise<PersistedMetaPayload> {
  const stored = await getStoredValue(META_KEY, null);
  if (!stored || !Array.isArray(stored.items)) {
    return { items: [], activeId: null };
  }
  const items: JsonSnapshotItem[] = stored.items
    .filter((it: any) => it && typeof it.id === 'string' && typeof it.label === 'string')
    .slice(0, MAX_JSON_SNAPSHOTS);
  const activeId =
    typeof stored.activeId === 'string' && items.some((it) => it.id === stored.activeId)
      ? stored.activeId
      : null;
  return { items, activeId };
}

export async function saveSnapshotMeta(
  items: JsonSnapshotItem[],
  activeId: string | null
): Promise<void> {
  // Persist only snapshots that are persisted to IndexedDB (exclude >5MB session-only items on restart)
  const persistedItems = items.filter((it) => it.persisted !== false).slice(0, MAX_JSON_SNAPSHOTS);
  const safeActiveId =
    activeId && persistedItems.some((it) => it.id === activeId) ? activeId : null;
  await setStoredValue(META_KEY, {
    items: persistedItems,
    activeId: safeActiveId,
  } as PersistedMetaPayload);
}

export async function saveSnapshotRaw(
  id: string,
  rawText: string,
  byteSize: number
): Promise<boolean> {
  if (byteSize > MAX_PERSIST_SNAPSHOT_BYTES) {
    sessionOnlyRawMap.set(id, rawText);
    return false;
  }
  sessionOnlyRawMap.delete(id);
  await setStoredValue(rawKey(id), rawText);
  return true;
}

export async function loadSnapshotRaw(id: string): Promise<string | null> {
  const mem = sessionOnlyRawMap.get(id);
  if (mem !== undefined) return mem;
  const stored = await getStoredValue(rawKey(id), null);
  return typeof stored === 'string' ? stored : null;
}

export async function deleteSnapshotRaw(id: string): Promise<void> {
  sessionOnlyRawMap.delete(id);
  await deleteStoredValue(rawKey(id));
}

export async function clearAllSnapshotsStorage(ids: string[]): Promise<void> {
  for (const id of ids) {
    sessionOnlyRawMap.delete(id);
    await deleteStoredValue(rawKey(id));
  }
  await deleteStoredValue(META_KEY);
}
