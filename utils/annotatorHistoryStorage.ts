import { AnnotatorDocument, AnnotatorHistoryMeta } from '../types/screenshotAnnotator';
import { deleteStoredValue, getStoredValue, setStoredValue } from './db';

export const MAX_ANNOTATOR_HISTORY = 15;
export const MAX_ANNOTATOR_ITEM_BYTES = 8 * 1024 * 1024; // 8MB safety cap per item

const META_KEY = 'snap_studio_history_meta';
const itemKey = (id: string) => `snap_studio_history_item_${id}`;

export function estimateDocumentBytes(doc: AnnotatorDocument): number {
  let bytes = doc.baseDataUrl.length;
  for (const ann of doc.annotations) {
    if (ann.type === 'overlayImage') {
      bytes += ann.dataUrl.length;
    } else {
      bytes += 160;
    }
  }
  return bytes;
}

export async function loadAnnotatorHistoryMeta(): Promise<AnnotatorHistoryMeta[]> {
  const stored = await getStoredValue(META_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((it: any) => it && typeof it.id === 'string' && typeof it.title === 'string')
    .slice(0, MAX_ANNOTATOR_HISTORY);
}

export async function loadAnnotatorHistoryDocument(id: string): Promise<AnnotatorDocument | null> {
  const doc = await getStoredValue(itemKey(id), null);
  if (!doc || typeof doc.baseDataUrl !== 'string') return null;
  return doc as AnnotatorDocument;
}

export async function saveAnnotatorHistoryEntry(
  meta: AnnotatorHistoryMeta,
  doc: AnnotatorDocument
): Promise<AnnotatorHistoryMeta[]> {
  const byteSize = estimateDocumentBytes(doc);
  if (byteSize > MAX_ANNOTATOR_ITEM_BYTES) {
    return loadAnnotatorHistoryMeta();
  }

  const existing = await loadAnnotatorHistoryMeta();
  const filtered = existing.filter((m) => m.id !== meta.id);
  const nextList = [{ ...meta, byteSize }, ...filtered];
  const kept = nextList.slice(0, MAX_ANNOTATOR_HISTORY);
  const evicted = nextList.slice(MAX_ANNOTATOR_HISTORY);

  await setStoredValue(itemKey(meta.id), doc);
  await setStoredValue(META_KEY, kept);

  for (const old of evicted) {
    await deleteStoredValue(itemKey(old.id));
  }

  return kept;
}

export async function deleteAnnotatorHistoryEntry(id: string): Promise<AnnotatorHistoryMeta[]> {
  const existing = await loadAnnotatorHistoryMeta();
  const next = existing.filter((m) => m.id !== id);
  await deleteStoredValue(itemKey(id));
  await setStoredValue(META_KEY, next);
  return next;
}

export async function clearAnnotatorHistory(): Promise<void> {
  const existing = await loadAnnotatorHistoryMeta();
  for (const item of existing) {
    await deleteStoredValue(itemKey(item.id));
  }
  await deleteStoredValue(META_KEY);
}
