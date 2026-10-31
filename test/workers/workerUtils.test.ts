import { describe, it, expect } from 'vitest';
import { mergeSortedUnique } from '../../workers/workerUtils';

describe('workerUtils - mergeSortedUnique', () => {
    it('should return a if b is empty', () => {
        const a = new Int32Array([1, 3, 5]);
        const b: number[] = [];
        const result = mergeSortedUnique(a, b);
        expect(Array.from(result)).toEqual([1, 3, 5]);
    });

    it('should return b as Int32Array if a is empty', () => {
        const a = new Int32Array([]);
        const b = [2, 4, 6];
        const result = mergeSortedUnique(a, b);
        expect(Array.from(result)).toEqual([2, 4, 6]);
    });

    it('should merge two sorted arrays without duplicates', () => {
        const a = new Int32Array([10, 20, 30]);
        const b = [15, 25, 35];
        const result = mergeSortedUnique(a, b);
        expect(Array.from(result)).toEqual([10, 15, 20, 25, 30, 35]);
    });

    it('should merge and remove duplicates', () => {
        const a = new Int32Array([10, 20, 30]);
        const b = [10, 25, 30, 40];
        const result = mergeSortedUnique(a, b);
        expect(Array.from(result)).toEqual([10, 20, 25, 30, 40]);
    });

    it('should handle interleaving elements correctly', () => {
        const a = new Int32Array([1, 2, 5, 8]);
        const b = [0, 2, 3, 7, 9];
        const result = mergeSortedUnique(a, b);
        expect(Array.from(result)).toEqual([0, 1, 2, 3, 5, 7, 8, 9]);
    });

    it('should handle large indices correctly', () => {
        const a = new Int32Array([1000000, 2000000]);
        const b = [500000, 1500000, 2500000];
        const result = mergeSortedUnique(a, b);
        expect(Array.from(result)).toEqual([500000, 1000000, 1500000, 2000000, 2500000]);
    });
});
