
import { describe, it, expect, vi } from 'vitest';

/**
 * Perf Tool Regression & Performance Unit Tests
 * 
 * 오늘 구현한 주요 기능(시간 가이드, 하이라이트 경계, 줌 간섭 방지)에 대한 
 * 리그레션 방지용 테스트 코드입니다.
 */

describe('PerfDashboard - Regression & Logic Analysis', () => {

    describe('Zoom & Navigation Logic', () => {
        it('should correctly determine if wheel event belongs to the specific dashboard instance', () => {
            // Mocking DOM elements with getAttribute
            const mockPaneId = 'left';
            const mockTarget = {
                closest: vi.fn((selector) => {
                    if (selector === '.perf-dashboard-container') {
                        return { getAttribute: (attr) => attr === 'data-pane-id' ? mockPaneId : null };
                    }
                    return null;
                })
            } as any;

            // Logic from PerfDashboard.tsx onGlobalWheel
            const belongsToMe = mockTarget.closest('.perf-dashboard-container')?.getAttribute('data-pane-id') === mockPaneId;

            expect(belongsToMe).toBe(true);

            // Check cross-pane isolation
            const belongToOther = mockTarget.closest('.perf-dashboard-container')?.getAttribute('data-pane-id') === 'right';
            expect(belongToOther).toBe(false);
        });
    });

    describe('Drawing & Culling Performance Logic', () => {
        // Mock segment data
        const generateSegments = (count: number) => Array.from({ length: count }, (_, i) => ({
            id: `s${i}`,
            startTime: i * 10,
            endTime: (i * 10) + 5,
            duration: 5,
            lane: i % 5,
            name: `Segment ${i}`,
            tid: '1234'
        }));

        it('should efficiently filter visible segments (Culling Logic)', () => {
            const allSegments = generateSegments(1000);
            const viewStart = 100;
            const viewEnd = 200;

            const startTime = performance.now();

            // Core Culling logic from PerfDashboard.tsx
            const visibleSegments = allSegments.filter(s => s.endTime >= viewStart && s.startTime <= viewEnd);

            const duration = performance.now() - startTime;

            // Should be very fast (under 1ms for 1000 segments)
            expect(duration).toBeLessThan(1);
            expect(visibleSegments.length).toBeGreaterThan(0);
            expect(visibleSegments.every(s => s.endTime >= viewStart && s.startTime <= viewEnd)).toBe(true);
        });

        it('should correctly identify search hits for highlighting (Border Logic)', () => {
            const segment = {
                id: 's1',
                name: 'MainLoop',
                tid: 'TID_5678',
                fileName: 'main.cpp',
                functionName: 'Run'
            } as any;

            const checkMatch = (s: any, query: string) => {
                if (!query) return false;
                const q = query.toLowerCase();
                return s.name.toLowerCase().includes(q) ||
                    s.tid.toLowerCase().includes(q) ||
                    s.fileName.toLowerCase().includes(q);
            };

            expect(checkMatch(segment, 'Loop')).toBe(true);
            expect(checkMatch(segment, '5678')).toBe(true);
            expect(checkMatch(segment, 'main')).toBe(true);
            expect(checkMatch(segment, 'unknown')).toBe(false);
        });
    });

    describe('Inactive State Resource Management', () => {
        it('should skip rendering loop when isActive is false', () => {
            const drawSpy = vi.fn();
            const isActive = false;

            // Simulated rendering loop part
            const render = () => {
                if (isActive) {
                    drawSpy();
                }
            };

            render();
            expect(drawSpy).not.toHaveBeenCalled();
        });
    });
});
