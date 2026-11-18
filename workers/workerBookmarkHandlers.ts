import {
    FilteredView,
    findVisualOfOriginal,
    getOriginalAt,
    getViewLength,
} from './workerIndexView';

let originalBookmarks: Set<number> = new Set();
let bookmarkCache: number[] = [];
let bookmarkCacheDirty = true;
let lastFilteredIndicesLength = 0;

export const BookmarkManager = {
    clearAll: () => {
        originalBookmarks.clear();
        BookmarkManager.invalidateCache();
    },
    invalidateCache: () => {
        bookmarkCacheDirty = true;
    },
    getOriginalBookmarksSorted: (): number[] => {
        return Array.from(originalBookmarks).sort((a, b) => a - b);
    },
    getVisualBookmarksFromView: (view: FilteredView): number[] => {
        const len = getViewLength(view);
        if (len === 0) return [];

        if (!bookmarkCacheDirty && len === lastFilteredIndicesLength) {
            return bookmarkCache;
        }

        const visualBookmarks: number[] = [];
        originalBookmarks.forEach(originalIdx => {
            const vIdx = findVisualOfOriginal(view, originalIdx);
            if (vIdx !== -1) {
                visualBookmarks.push(vIdx);
            }
        });

        bookmarkCache = visualBookmarks;
        bookmarkCacheDirty = false;
        lastFilteredIndicesLength = len;

        return visualBookmarks;
    },
    getVisualBookmarks: (filteredIndices: Int32Array | null): number[] => {
        return BookmarkManager.getVisualBookmarksFromView({
            isIdentity: false,
            totalLines: filteredIndices ? filteredIndices.length : 0,
            indices: filteredIndices,
        });
    },
    toggleBookmarkFromView: (
        visualIndex: number,
        view: FilteredView
    ): { originalIndex: number, isAdded: boolean } | null => {
        const len = getViewLength(view);
        const originalIndex = getOriginalAt(view, visualIndex);
        if (originalIndex === -1) {
            console.warn(`[Worker] Toggle Bookmark: Index out of bounds (visual=${visualIndex}, max=${len})`);
            return null;
        }

        let isAdded = false;
        if (originalBookmarks.has(originalIndex)) {
            originalBookmarks.delete(originalIndex);
            isAdded = false;
        } else {
            originalBookmarks.add(originalIndex);
            isAdded = true;
        }

        BookmarkManager.invalidateCache();
        return { originalIndex, isAdded };
    },
    toggleBookmark: (
        visualIndex: number,
        filteredIndices: Int32Array | null
    ): { originalIndex: number, isAdded: boolean } | null => {
        return BookmarkManager.toggleBookmarkFromView(visualIndex, {
            isIdentity: false,
            totalLines: filteredIndices ? filteredIndices.length : 0,
            indices: filteredIndices,
        });
    },
    clearBookmarks: (respond: (response: any) => void) => {
        BookmarkManager.clearAll();
        respond({ type: 'BOOKMARKS_UPDATED', payload: { visualBookmarks: [] }, requestId: '' });
    }
};
