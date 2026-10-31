import { describe, it, expect, beforeEach } from 'vitest';
import { BookmarkManager } from '../../workers/workerBookmarkHandlers';

describe('workerBookmarkHandlers - BookmarkManager', () => {
    beforeEach(() => {
        BookmarkManager.clearBookmarks(() => {});
    });

    it('should toggle a bookmark and add it if not present', () => {
        const filteredIndices = new Int32Array([10, 20, 30]);
        const result = BookmarkManager.toggleBookmark(1, filteredIndices); // visual index 1 corresponds to original index 20
        
        expect(result).toEqual({ originalIndex: 20, isAdded: true });
        expect(BookmarkManager.getOriginalBookmarksSorted()).toEqual([20]);
    });

    it('should toggle a bookmark and remove it if present', () => {
        const filteredIndices = new Int32Array([10, 20, 30]);
        BookmarkManager.toggleBookmark(1, filteredIndices);
        
        const result = BookmarkManager.toggleBookmark(1, filteredIndices);
        expect(result).toEqual({ originalIndex: 20, isAdded: false });
        expect(BookmarkManager.getOriginalBookmarksSorted()).toEqual([]);
    });

    it('should always return bookmarks in sorted order', () => {
        const filteredIndices = new Int32Array([10, 20, 30, 40]);
        BookmarkManager.toggleBookmark(2, filteredIndices); // 30
        BookmarkManager.toggleBookmark(0, filteredIndices); // 10
        BookmarkManager.toggleBookmark(1, filteredIndices); // 20
        
        expect(BookmarkManager.getOriginalBookmarksSorted()).toEqual([10, 20, 30]);
    });

    it('should correctly filter visual bookmarks based on current filteredIndices', () => {
        const filteredIndices1 = new Int32Array([10, 20, 30, 40]);
        BookmarkManager.toggleBookmark(1, filteredIndices1); // abs 20
        BookmarkManager.toggleBookmark(3, filteredIndices1); // abs 40
        
        // Initial visual bookmarks
        expect(BookmarkManager.getVisualBookmarks(filteredIndices1)).toEqual([1, 3]);
        
        // New filteredIndices (e.g. after a new filter application)
        const filteredIndices2 = new Int32Array([5, 20, 25, 40, 50]);
        // Visual index of abs 20 is now 1, and abs 40 is now 3
        expect(BookmarkManager.getVisualBookmarks(filteredIndices2)).toEqual([1, 3]);
        
        // If 40 is no longer in filteredIndices
        const filteredIndices3 = new Int32Array([5, 20, 25, 50]);
        expect(BookmarkManager.getVisualBookmarks(filteredIndices3)).toEqual([1]);
    });

    it('should clear all bookmarks', () => {
        const filteredIndices = new Int32Array([10, 20, 30]);
        BookmarkManager.toggleBookmark(0, filteredIndices);
        BookmarkManager.toggleBookmark(1, filteredIndices);
        
        BookmarkManager.clearBookmarks(() => {});
        expect(BookmarkManager.getOriginalBookmarksSorted()).toEqual([]);
    });

    it('should correctly handle toggling bookmark when filtering is active', () => {
        const filteredIndices = new Int32Array([10, 20, 30, 40, 50]);
        
        // Toggle visual index 2 (absolute 30)
        BookmarkManager.toggleBookmark(2, filteredIndices);
        expect(BookmarkManager.getOriginalBookmarksSorted()).toEqual([30]);
        expect(BookmarkManager.getVisualBookmarks(filteredIndices)).toEqual([2]);
        
        // Filter changes: only 30 remains
        const filteredIndices2 = new Int32Array([30, 60, 70]);
        // Visual index of absolute 30 is now 0
        expect(BookmarkManager.getVisualBookmarks(filteredIndices2)).toEqual([0]);
    });
});
