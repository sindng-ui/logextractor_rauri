import { describe, expect, it } from 'vitest';
import {
    FilteredView,
    decodePackedLinesBinary,
    findVisualOfOriginal,
    getOriginalAt,
    getViewLength,
    insertSortedInt32,
    materializeViewIndices,
    removeAtInt32,
} from '../../workers/workerIndexView';
import {
    FilterCacheStore,
    normalizeFilterSnapshot,
    selectIncrementalFilterPlan,
} from '../../utils/incrementalFilter';

function packLines(rows: Array<{ lineIdx: number; text: string }>): Uint8Array {
    const encoder = new TextEncoder();
    const encoded = rows.map(r => ({ lineIdx: r.lineIdx, bytes: encoder.encode(r.text) }));
    const totalLen = 4 + encoded.reduce((acc, r) => acc + 8 + r.bytes.length, 0);
    const out = new Uint8Array(totalLen);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, encoded.length, true);
    let cursor = 4;
    for (const r of encoded) {
        dv.setUint32(cursor, r.lineIdx, true);
        dv.setUint32(cursor + 4, r.bytes.length, true);
        cursor += 8;
        out.set(r.bytes, cursor);
        cursor += r.bytes.length;
    }
    return out;
}

describe('workerIndexView', () => {
    it('supports O(1) identity view operations without backing Int32Array allocation', () => {
        const view: FilteredView = {
            isIdentity: true,
            totalLines: 1_000_000,
            indices: null,
        };

        expect(getViewLength(view)).toBe(1_000_000);
        expect(getOriginalAt(view, 0)).toBe(0);
        expect(getOriginalAt(view, 42_123)).toBe(42_123);
        expect(getOriginalAt(view, -1)).toBe(-1);
        expect(getOriginalAt(view, 1_000_000)).toBe(-1);

        expect(findVisualOfOriginal(view, 999_999)).toBe(999_999);
        expect(findVisualOfOriginal(view, 1_000_000)).toBe(-1);
    });

    it('supports array view operations and sorted mutations', () => {
        const arr = new Int32Array([2, 10, 25]);
        const view: FilteredView = {
            isIdentity: false,
            totalLines: 100,
            indices: arr,
        };

        expect(getViewLength(view)).toBe(3);
        expect(getOriginalAt(view, 1)).toBe(10);
        expect(findVisualOfOriginal(view, 25)).toBe(2);
        expect(findVisualOfOriginal(view, 11)).toBe(-1);

        const inserted = insertSortedInt32(arr, 15);
        expect(Array.from(inserted)).toEqual([2, 10, 15, 25]);
        expect(insertSortedInt32(inserted, 15)).toBe(inserted);

        const removed = removeAtInt32(inserted, 1);
        expect(Array.from(removed)).toEqual([2, 15, 25]);
    });

    it('materializes identity view only on demand', () => {
        const view: FilteredView = { isIdentity: true, totalLines: 5, indices: null };
        const mat = materializeViewIndices(view);
        expect(mat).toBeInstanceOf(Int32Array);
        expect(Array.from(mat!)).toEqual([0, 1, 2, 3, 4]);
    });

    it('decodes Rust packed binary line buffers including UTF-8 text', () => {
        const packed = packLines([
            { lineIdx: 10, text: 'hello world' },
            { lineIdx: 25, text: '한글 로그 테스트 🚀' },
        ]);
        const rows = decodePackedLinesBinary(packed, new TextDecoder());
        expect(rows).toEqual([
            { lineIdx: 10, content: 'hello world' },
            { lineIdx: 25, content: '한글 로그 테스트 🚀' },
        ]);
        expect(decodePackedLinesBinary(new Uint8Array(0), new TextDecoder())).toEqual([]);
    });

    it('supports lightweight metadata-only FilterCacheStore entries for native engine', () => {
        const store = new FilterCacheStore();
        const s1 = normalizeFilterSnapshot(
            { isOpen: true, name: 'r', includeGroups: [['error']], excludes: [] } as any,
            'none'
        );
        const s2 = normalizeFilterSnapshot(
            { isOpen: true, name: 'r', includeGroups: [['error', 'timeout']], excludes: [] } as any,
            'none'
        );

        store.record({
            snapshot: s1,
            rawMatchedIndices: new Int32Array(0),
            matchCount: 500_000,
            hasRawIndices: false,
            totalLines: 10_000_000,
        });

        const best = store.findBestParent(s2, 10_000_000);
        expect(best).not.toBeNull();
        expect(best!.exact).toBe(false);
        expect(best!.entry.snapshot.key).toBe(s1.key);

        const fallbackPlan = selectIncrementalFilterPlan({
            cache: store,
            nextSnapshot: s2,
            totalLines: 10_000_000,
            isStreamMode: false,
            isLocalFileMode: true,
            lineOffsets: null,
            fileSize: 1000,
        });
        expect(fallbackPlan.mode).toBe('full-scan');
    });
});
