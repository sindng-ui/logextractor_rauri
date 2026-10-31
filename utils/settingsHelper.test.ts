import { describe, it, expect } from 'vitest';
import { mergeById } from './settingsHelper';

describe('mergeById', () => {
    it('should add new items to the existing list', () => {
        const current = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
        const incoming = [{ id: '3', name: 'C' }];

        const result = mergeById(current, incoming);

        expect(result).toHaveLength(3);
        expect(result).toEqual([
            { id: '1', name: 'A' },
            { id: '2', name: 'B' },
            { id: '3', name: 'C' }
        ]);
    });

    it('should update existing items if ID matches', () => {
        const current = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
        const incoming = [{ id: '2', name: 'B Updated' }];

        const result = mergeById(current, incoming);

        expect(result).toHaveLength(2);
        expect(result.find(i => i.id === '2')?.name).toBe('B Updated');
        expect(result.find(i => i.id === '1')?.name).toBe('A');
    });

    it('should remove duplicates in the incoming list (last wins)', () => {
        const current = [{ id: '1', name: 'A' }];
        const incoming = [{ id: '2', name: 'B1' }, { id: '2', name: 'B2' }];

        const result = mergeById(current, incoming);

        expect(result).toHaveLength(2);
        expect(result.find(i => i.id === '2')?.name).toBe('B2');
    });

    it('should handle empty current list', () => {
        const current: { id: string, name: string }[] = [];
        const incoming = [{ id: '1', name: 'A' }];

        const result = mergeById(current, incoming);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('A');
    });

    it('should handle empty incoming list', () => {
        const current = [{ id: '1', name: 'A' }];
        const incoming: { id: string, name: string }[] = [];

        const result = mergeById(current, incoming);

        expect(result).toEqual(current);
    });

    it('should satisfy the user scenario: current 3, incoming 4 (total 7 distinct)', () => {
        const current = [
            { id: 'c1', val: 1 }, { id: 'c2', val: 1 }, { id: 'c3', val: 1 }
        ];
        const incoming = [
            { id: 'i1', val: 2 }, { id: 'i2', val: 2 }, { id: 'i3', val: 2 }, { id: 'i4', val: 2 }
        ];

        const result = mergeById(current, incoming);

        expect(result).toHaveLength(7);
    });

    it('should satisfy the user scenario: current 3, incoming 4 (1 overlap, total 6)', () => {
        const current = [
            { id: 'c1', val: 1 }, { id: 'c2', val: 1 }, { id: 'overlap', val: 1 }
        ];
        const incoming = [
            { id: 'i1', val: 2 }, { id: 'i2', val: 2 }, { id: 'i3', val: 2 }, { id: 'overlap', val: 2 } // Overlap
        ];

        const result = mergeById(current, incoming);

        expect(result).toHaveLength(6);
        expect(result.find(i => i.id === 'overlap')?.val).toBe(2);
    });
});
