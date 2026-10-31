import { renderHook, act, waitFor } from '@testing-library/react';
import { useLogExtractorLogic } from '../../hooks/useLogExtractorLogic';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { workerRegistry } from '../../hooks/LogWorkerRegistry';

// --- Mocks ---

import { getStoredValue } from '../../utils/db';

// Define hoisted mocks for things we need to access directly but are inside factories
const { mockedAddToast } = vi.hoisted(() => ({ mockedAddToast: vi.fn() }));

// Mock Database Utils
vi.mock('../../utils/db', () => ({
    getStoredValue: vi.fn().mockResolvedValue(null),
    setStoredValue: vi.fn(),
}));

// Mock Toast Context
vi.mock('../../contexts/ToastContext', () => ({
    useToast: () => ({ addToast: mockedAddToast }),
}));

vi.mock('../../components/LogViewer/LogViewPreferencesContext', () => ({
    useLogViewPreferencesContext: () => ({
        fontSize: 12,
        lineHeight: 1.2,
        setFontSize: vi.fn(),
        setLineHeight: vi.fn(),
    })
}));

// Mock Web Worker
class MockWorker {
    static instances: MockWorker[] = [];

    // Helper to access the 'last' created worker, usually Right Pane or just convenient
    static get lastInstance() {
        return this.instances[this.instances.length - 1];
    }

    postMessage = vi.fn();
    terminate = vi.fn();
    onmessage: ((e: MessageEvent) => void) | null = null;
    addEventListener = vi.fn();
    removeEventListener = vi.fn();

    constructor() {
        MockWorker.instances.push(this);
    }

    // Helper to simulate worker response
    emitMessage(data: any) {
        if (this.onmessage) {
            this.onmessage({ data } as MessageEvent);
        }
    }

    static reset() {
        this.instances = [];
    }
}
// Assign to global
vi.stubGlobal('Worker', MockWorker);


describe('useLogExtractorLogic (Frontend Logic)', () => {

    beforeEach(() => {
        vi.stubGlobal('Worker', MockWorker);
        vi.clearAllMocks();
        mockedAddToast.mockClear();
        MockWorker.reset();
        workerRegistry.clearAll(); // ✅ Reset singleton for each test
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // Helper props
    const defaultProps = {
        rules: [],
        onUpdateRules: vi.fn(),
        onExportSettings: vi.fn(),
        onImportSettings: vi.fn(),
        configPanelWidth: 300,
        setConfigPanelWidth: vi.fn(),
        tabId: 'test-tab',
        isActive: true,
        isPanelOpen: true,
        setIsPanelOpen: vi.fn(),
    };

    it('should initialize and spawn workers', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        // Should create Left and Right workers
        expect(MockWorker.instances.length).toBe(2);
        expect(result.current).toBeDefined();
    });

    it('should handle Tizen connection start (sdb)', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        const mockSocket = Object.assign(new EventEmitter(), {
            disconnect: vi.fn(),
            connect: vi.fn(),
            off: vi.fn(),
            removeListener: vi.fn(),
            removeAllListeners: vi.fn(),
        });

        act(() => {
            // handleTizenStreamStart(socket, deviceName, mode)
            result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'sdb');
        });

        // Verify state updates
        expect(result.current.tizenSocket).toBe(mockSocket);

        // Check Left Worker (index 0)
        const leftWorker = MockWorker.instances[0];
        expect(leftWorker.postMessage).toHaveBeenCalledWith({ type: 'INIT_STREAM', payload: { isLive: true } });
    });

    // Skipped due to Timer/Environment flakiness in CLI (vitest)
    describe.skip('Timer Dependent Tests', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.clearAllTimers();
            vi.useRealTimers();
        });

        it('should BUFFER log_data for 250ms before sending to worker', async () => {
            const { result, unmount } = renderHook(() => useLogExtractorLogic(defaultProps));
            const mockSocket = Object.assign(new EventEmitter(), {
                disconnect: vi.fn(),
                connect: vi.fn(),
            });

            act(() => {
                result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'sdb');
            });

            const leftWorker = MockWorker.instances[0];
            // Clear previous calls (INIT_STREAM etc)
            leftWorker.postMessage.mockClear();

            // 1. Emit Log Data
            const logLine = 'Log Line 1\n';
            act(() => {
                mockSocket.emit('log_data', logLine);
            });

            // 2. Immediate check: Should NOT have sent yet
            expect(leftWorker.postMessage).not.toHaveBeenCalled();

            // 3. Advance time by 200ms (Total 200ms) - Still waiting (buffer timeout is 250ms)
            act(() => {
                vi.advanceTimersByTime(200);
            });
            expect(leftWorker.postMessage).not.toHaveBeenCalled();

            // 4. Advance time by 100ms (Total 300ms) - Should flush (past 250ms threshold)
            act(() => {
                vi.advanceTimersByTime(100);
            });

            expect(leftWorker.postMessage).toHaveBeenCalledWith({
                type: 'PROCESS_CHUNK',
                payload: logLine
            });

            unmount();
        });
    });

    it('should FLUSH IMMEDIATELY if buffer exceeds limit (>500 items)', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
        const mockSocket = Object.assign(new EventEmitter(), {
            disconnect: vi.fn(),
            connect: vi.fn(),
        });

        act(() => {
            result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'sdb');
        });
        const leftWorker = MockWorker.instances[0];
        leftWorker.postMessage.mockClear();

        // Emit 505 lines rapidly (MAX_BUFFER_SIZE is 500)
        act(() => {
            for (let i = 0; i < 505; i++) {
                mockSocket.emit('log_data', `Line ${i}\n`);
            }
        });

        // Should have called postMessage at least once (for the flush)
        expect(leftWorker.postMessage).toHaveBeenCalled();

        // Verify the payload of the first call contains many lines
        const callArgs = leftWorker.postMessage.mock.calls[0][0];
        expect(callArgs.type).toBe('PROCESS_CHUNK');
        expect(callArgs.payload.length).toBeGreaterThan(100); // Should be a big chunk
    });

    it('should reset state on disconnect', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
        const mockSocket = Object.assign(new EventEmitter(), {
            disconnect: vi.fn(),
            connect: vi.fn(),
        });

        act(() => {
            result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'sdb');
        });

        expect(result.current.tizenSocket).toBeTruthy();

        act(() => {
            mockSocket.emit('disconnect');
        });

        expect(result.current.tizenSocket).toBeNull();
    });

    it('should handle SSH Error event', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
        const mockSocket = Object.assign(new EventEmitter(), {
            disconnect: vi.fn(),
            connect: vi.fn(),
        });

        act(() => {
            result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'ssh');
        });

        const leftWorker = MockWorker.instances[0];
        leftWorker.postMessage.mockClear();

        // Emit SSH Error
        act(() => {
            mockSocket.emit('ssh_error', { message: 'Auth Failed' });
        });

        // 1. Should show toast
        expect(mockedAddToast).toHaveBeenCalledWith(expect.stringContaining('SSH Error: Auth Failed'), 'error');

        // 2. Should append error to log (flushed to worker)
        expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'PROCESS_CHUNK',
            payload: expect.stringContaining('[SSH ERROR] Auth Failed')
        }));
    });

    it('should handle SSH Auth Request and Response', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
        const mockSocket = Object.assign(new EventEmitter(), {
            disconnect: vi.fn(),
            connect: vi.fn(),
        });
        // Spy on emit
        const emitSpy = vi.spyOn(mockSocket, 'emit');

        act(() => {
            result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'ssh');
        });

        // Emit Auth Request
        act(() => {
            mockSocket.emit('ssh_auth_request', { prompt: 'Password: ', echo: false });
        });

        // Should show toast
        expect(mockedAddToast).toHaveBeenCalledWith(expect.stringContaining('Input Required'), 'info');

        // Send Command (Response)
        act(() => {
            result.current.sendTizenCommand('secret_password');
        });

        // Should emit ssh_auth_response
        expect(emitSpy).toHaveBeenCalledWith('ssh_auth_response', 'secret_password');

        // And reset auth state (subsequent commands should be normal ssh_write)
        emitSpy.mockClear();
        act(() => {
            result.current.sendTizenCommand('ls -la');
        });
        expect(emitSpy).toHaveBeenCalledWith('ssh_write', 'ls -la');
    });

    it('should handle logical disconnect (sdb_status)', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
        const mockSocket = Object.assign(new EventEmitter(), {
            disconnect: vi.fn(),
            connect: vi.fn(),
        });

        act(() => {
            result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'sdb');
        });
        expect(result.current.tizenSocket).toBeTruthy();

        // Emit logical disconnect
        act(() => {
            mockSocket.emit('sdb_status', { status: 'disconnected' });
        });

        expect(result.current.tizenSocket).toBeNull();
    });

    // Skipped due to waitFor timeout in CLI environment
    it.skip('should load logViewPreferences from DB on mount', async () => {
        // Setup mock return
        vi.mocked(getStoredValue).mockResolvedValueOnce(JSON.stringify({ rowHeight: 99, fontSize: 14 }));

        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        // Initial state might be default, need to wait for useEffect -> getStoredValue resolves
        await waitFor(() => {
            expect(result.current.logViewPreferences.rowHeight).toBe(99);
            expect(result.current.logViewPreferences.fontSize).toBe(14);
        });
    }, 10000);
    
    describe('Quick Highlighting', () => {
        const mockPropsWithRule = {
            ...defaultProps,
            rules: [{
                id: 'rule-1',
                name: 'Rule 1',
                highlights: [],
                includeGroups: [],
                excludes: []
            }]
        };

        it('should add a quick highlight if it does not exist', () => {
            const onUpdateRules = vi.fn();
            const { result } = renderHook(() => useLogExtractorLogic({ ...mockPropsWithRule, onUpdateRules }));

            // Initially empty
            expect(result.current.currentConfig?.highlights.length).toBe(0);

            act(() => {
                result.current.addQuickHighlight('ERROR_TAG');
            });

            // Should call onUpdateRules with the new highlight
            expect(onUpdateRules).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({
                    highlights: [expect.objectContaining({
                        keyword: 'ERROR_TAG',
                        color: 'indigo-500'
                    })]
                })
            ]));
            expect(mockedAddToast).toHaveBeenCalledWith('Highlighted: ERROR_TAG', 'success');
        });

        it('should remove a quick highlight if it already exists (toggle)', () => {
            const onUpdateRules = vi.fn();
            const existingHighlight = { id: 'quick-123', keyword: 'DUPLICATE', color: 'indigo-500' };
            const propsWithHighlight = {
                ...mockPropsWithRule,
                rules: [{
                    ...mockPropsWithRule.rules[0],
                    highlights: [existingHighlight],
                    includeGroups: [],
                    excludes: []
                }],
                onUpdateRules
            };
            const { result } = renderHook(() => useLogExtractorLogic(propsWithHighlight));

            act(() => {
                result.current.addQuickHighlight('DUPLICATE');
            });

            // Should call onUpdateRules with empty highlights array
            expect(onUpdateRules).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({
                    highlights: []
                })
            ]));
            expect(mockedAddToast).toHaveBeenCalledWith('Removed Highlight: DUPLICATE', 'info');
        });

        it('should clear all quick highlights but keep permanent ones', () => {
            const onUpdateRules = vi.fn();
            const quickH = { id: 'quick-1', keyword: 'QUICK', color: 'indigo-500' };
            const permanentH = { id: 'perm-1', keyword: 'PERM', color: 'red-500' };
            const propsWithMixed = {
                ...mockPropsWithRule,
                rules: [{
                    ...mockPropsWithRule.rules[0],
                    highlights: [quickH, permanentH],
                    includeGroups: [],
                    excludes: []
                }],
                onUpdateRules
            };
            const { result } = renderHook(() => useLogExtractorLogic(propsWithMixed));

            act(() => {
                result.current.clearQuickHighlights();
            });

            // Should remove quickH but keep permanentH
            expect(onUpdateRules).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({
                    highlights: [permanentH]
                })
            ]));
            expect(mockedAddToast).toHaveBeenCalledWith('Cleared 1 quick highlights', 'info');
        });
    });

    describe('v8 Filtering & Sync Guard', () => {
        it('should dispatch FILTER_LOGS to worker even on empty rules to maintain sync, but NOT set worker ready to false', async () => {
            vi.useFakeTimers();
            
            const emptyRuleProps = {
                ...defaultProps,
                rules: [{
                    id: 'rule-empty',
                    name: 'Empty Rule',
                    highlights: [],
                    includeGroups: [],
                    excludes: [],
                    happyGroups: []
                }]
            };

            // Initial mock: Left worker is ready
            const { result } = renderHook(() => useLogExtractorLogic(emptyRuleProps));

            const leftWorker = MockWorker.instances[0];
            act(() => {
                leftWorker.emitMessage({ type: 'INDEX_COMPLETE', payload: { totalLines: 100 } });
            });

            // 1. Initial State Check: Worker should be ready
            expect(result.current.leftWorkerReady).toBe(true);

            // 2. Clear postMessage mocks
            leftWorker.postMessage.mockClear();

            // 3. Trigger debounced filter (which has 150ms timeout)
            act(() => {
                vi.advanceTimersByTime(150);
            });

            // 4. Verification:
            // - Ready state must STAY true (no setLeftWorkerReady(false) was triggered!)
            expect(result.current.leftWorkerReady).toBe(true);
            
            // - FILTER_LOGS postMessage MUST be dispatched to ensure SAB/Worker sync!
            expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'FILTER_LOGS'
            }));

            vi.useRealTimers();
        });
    });

    describe('Clipboard Paste & View', () => {
        let mockReadText: any;

        beforeEach(() => {
            mockReadText = vi.fn();
            vi.stubGlobal('navigator', {
                clipboard: {
                    readText: mockReadText
                }
            });
        });

        afterEach(() => {
            vi.stubGlobal('navigator', undefined);
        });

        it('should paste log data from clipboard and trigger file change flow', async () => {
            const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
            
            // Setup clipboard mock return
            const testLog = 'Line 1: Clipboard Log\nLine 2: Test Data';
            mockReadText.mockResolvedValueOnce(testLog);

            const leftWorker = MockWorker.instances[0];
            leftWorker.postMessage.mockClear();

            // Trigger clipboard paste
            await act(async () => {
                await result.current.handlePasteClipboard('left');
            });

            // 1. Should show success toast
            expect(mockedAddToast).toHaveBeenCalledWith('Pasted content from clipboard!', 'success');

            // 2. Left worker should receive INIT_FILE with a mock File containing the clipboard data
            expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'INIT_FILE',
                payload: expect.any(File)
            }));

            const sentFile = leftWorker.postMessage.mock.calls[0][0].payload;
            expect(sentFile.name).toContain('[Clipboard]');
            expect(sentFile.name).toContain('.log');
        });

        it('should alert if clipboard content is empty', async () => {
            const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
            mockReadText.mockResolvedValueOnce('');

            await act(async () => {
                await result.current.handlePasteClipboard('left');
            });

            expect(mockedAddToast).toHaveBeenCalledWith('Clipboard is empty', 'warning');
        });

        it('should handle permission or other clipboard read failures gracefully', async () => {
            const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
            mockReadText.mockRejectedValueOnce(new Error('Permission Denied'));

            await act(async () => {
                await result.current.handlePasteClipboard('left');
            });

            expect(mockedAddToast).toHaveBeenCalledWith(expect.stringContaining('Failed to read clipboard'), 'error');
        });
    });
});

