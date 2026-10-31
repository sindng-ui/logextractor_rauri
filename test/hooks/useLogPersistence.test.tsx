import { renderHook, act, waitFor } from '@testing-library/react';
import { useLogExtractorLogic } from '../../hooks/useLogExtractorLogic';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { getStoredValue, setStoredValue } from '../../utils/db';
import { workerRegistry } from '../../hooks/LogWorkerRegistry';

// --- Mocks ---

vi.mock('../../utils/db', () => ({
    getStoredValue: vi.fn(),
    setStoredValue: vi.fn(),
}));

// Mock Electron API
vi.stubGlobal('electronAPI', {
    readFile: vi.fn().mockResolvedValue('file content'),
    getFileSize: vi.fn().mockResolvedValue(1024),
    onFileChunk: vi.fn(() => () => { }),
    onFileStreamComplete: vi.fn(() => () => { }),
});

// Mock Toast Context
vi.mock('../../contexts/ToastContext', () => ({
    useToast: () => ({ addToast: vi.fn() }),
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
    postMessage = vi.fn();
    terminate = vi.fn();
    onmessage: ((e: MessageEvent) => void) | null = null;
    constructor() { MockWorker.instances.push(this); }
    static reset() { this.instances = []; }
}
vi.stubGlobal('Worker', MockWorker);

describe('Log Persistence & Auto-loading', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        MockWorker.reset();
        workerRegistry.clearAll(); // ✅ Reset singleton for each test
    });

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

    it('should auto-load SINGLE mode file from localStorage', async () => {
        (getStoredValue as Mock).mockResolvedValue(JSON.stringify({
            filePath: 'test/path/to/logfile.log',
            isDualView: false
        }));

        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        // 펭귄 팁: 파일명이 정상적으로 업데이트 될 때까지 대기
        await waitFor(() => {
            expect(result.current.leftFileName).toBe('logfile.log');
        }, { timeout: 3000 });

        expect(MockWorker.instances[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'INIT_LOCAL_FILE_STREAM',
            payload: expect.objectContaining({ path: 'test/path/to/logfile.log' })
        }));
    });

    it('should auto-load SPLIT mode files from localStorage', async () => {
        (getStoredValue as Mock).mockResolvedValue(JSON.stringify({
            filePath: 'left.log',
            rightFilePath: 'right.log',
            isDualView: true
        }));

        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        await waitFor(() => {
            expect(result.current.isDualView).toBe(true);
            expect(result.current.leftFileName).toBe('left.log');
            expect(result.current.rightFileName).toBe('right.log');
        }, { timeout: 3000 });

        expect(MockWorker.instances.length).toBeGreaterThanOrEqual(2);
    });

    it('should prevent overwriting state before loadState completes (Race Condition Check)', async () => {
        vi.useFakeTimers();
        (getStoredValue as Mock).mockResolvedValue(null);

        renderHook(() => useLogExtractorLogic(defaultProps));

        // 1. 부팅 직후 5초 전진 (저장 주기 도달)
        act(() => {
            vi.advanceTimersByTime(5000);
        });

        // 2. loadState가 아직 끝나지 않은 시점에서는 저장이 발생하지 않아야 함
        expect(setStoredValue).not.toHaveBeenCalled();

        // 3. 비동기 작업(loadState) 완료 대기
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });

        // 4. 다시 5초 전진하면 이제는 저장이 허용됨
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(setStoredValue).toHaveBeenCalled();

        vi.useRealTimers();
    });
});
