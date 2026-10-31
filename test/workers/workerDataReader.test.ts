import { describe, it, expect, vi } from 'vitest';
import { binarySearch, getLinesByIndices } from '../../workers/workerDataReader';

describe('workerDataReader - binarySearch', () => {
    it('should find the index of a value in a sorted Int32Array', () => {
        const arr = new Int32Array([10, 20, 30, 40, 50]);
        expect(binarySearch(arr, 30)).toBe(2);
        expect(binarySearch(arr, 10)).toBe(0);
        expect(binarySearch(arr, 50)).toBe(4);
    });

    it('should return -1 if the value is not found', () => {
        const arr = new Int32Array([10, 20, 30, 40, 50]);
        expect(binarySearch(arr, 25)).toBe(-1);
        expect(binarySearch(arr, 5)).toBe(-1);
        expect(binarySearch(arr, 55)).toBe(-1);
    });

    it('should handle an empty array', () => {
        const arr = new Int32Array([]);
        expect(binarySearch(arr, 10)).toBe(-1);
    });
});

describe('workerDataReader - getLinesByIndices', () => {
    const mockContext: any = {
        filteredIndices: new Int32Array([10, 20, 30, 40, 50]),
        isStreamMode: true,
        logBuffer: new Uint8Array([76, 105, 110, 101, 32, 49, 48]), // "Line 10"
        lineOffsetsStream: new BigUint64Array([0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]), // Correct BigInt literals
        lineLengthsStream: new Uint32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]), // len 7 for idx 10
        respond: vi.fn()
    };
    // Update offsets for index 10
    mockContext.lineOffsetsStream[10] = 0n;

    it('should correctly handle isAbsolute: true (mapping absolute to visual)', async () => {
        const indices = [30]; // Absolute index 30 is at visual index 2
        await getLinesByIndices(mockContext, indices, 'req1', true);

        const response = mockContext.respond.mock.calls[0][0];
        expect(response.type).toBe('LINES_DATA');
        expect(response.payload.lines[0].formattedLineIndex).toBe(2); // Visual index 2
        expect(response.payload.lines[0].lineNum).toBe(31); // 30 + 1
    });

    it('should correctly handle isAbsolute: false (mapping visual to absolute)', async () => {
        const indices = [2]; // Visual index 2 maps to absolute index 30
        await getLinesByIndices(mockContext, indices, 'req2', false);

        const response = mockContext.respond.mock.calls[1][0];
        expect(response.type).toBe('LINES_DATA');
        expect(response.payload.lines[0].formattedLineIndex).toBe(2);
        expect(response.payload.lines[0].lineNum).toBe(31); // 30 + 1
    });

    it('should skip absolute indices that are not in filteredIndices', async () => {
        const indices = [25]; // Absolute index 25 is not in filteredIndices
        await getLinesByIndices(mockContext, indices, 'req3', true);

        const response = mockContext.respond.mock.calls[2][0];
        expect(response.payload.lines).toHaveLength(0);
    });

    it('[REGRESSION] should return nothing if visual index is passed with isAbsolute:true while filtering is active', async () => {
        // This simulates the bug fixed in LogSession.tsx
        // index 2 is a visual index (intended for absolute index 30), 
        // but if treated as absolute 2, it won't be found in filteredIndices [10, 20, 30, 40, 50]
        const indices = [2]; 
        await getLinesByIndices(mockContext, indices, 'req-reg', true);

        const response = mockContext.respond.mock.calls.find(c => c[0].requestId === 'req-reg')[0];
        expect(response.payload.lines).toHaveLength(0);
    });
});
