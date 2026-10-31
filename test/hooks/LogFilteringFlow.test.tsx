import { renderHook, act, waitFor } from '@testing-library/react';
import { useLogExtractorLogic } from '../../hooks/useLogExtractorLogic';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogWorkerResponse } from '../../types';
import { workerRegistry } from '../../hooks/LogWorkerRegistry';

// --- Mocks ---

vi.mock('../../utils/db', () => ({
    getStoredValue: vi.fn().mockResolvedValue(null),
    setStoredValue: vi.fn(),
}));

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

    constructor() {
        MockWorker.instances.push(this);
    }

    emitMessage(data: LogWorkerResponse) {
        if (this.onmessage) {
            this.onmessage({ data } as MessageEvent);
        }
    }

    static reset() {
        MockWorker.instances = [];
    }
}
vi.stubGlobal('Worker', MockWorker);

// Mock Electron API
const mockElectronAPI = {
    streamReadFile: vi.fn().mockResolvedValue(undefined),
    onFileStreamData: vi.fn(),
    onFileStreamComplete: vi.fn(),
    onFileStreamError: vi.fn(),
    readFile: vi.fn().mockResolvedValue(''),
};
vi.stubGlobal('electronAPI', mockElectronAPI);

describe('Log Filtering Flow Integration Test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MockWorker.reset();
        workerRegistry.clearAll(); // ✅ Reset singleton for each test
    });

    const defaultProps = {
        rules: [{
            id: 'rule-1',
            name: 'Error Only',
            includeGroups: [['ERROR']],
            excludes: [],
            happyCombosCaseSensitive: false,
            blockListCaseSensitive: false,
            highlights: [],
            showRawLogLines: false
        }],
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

    it('[UT 1] should follow the sequence: loadFile -> STREAM_DONE -> FILTER_LOGS', async () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        // 1. 초기 상태: 워커 2개 생성됨
        expect(MockWorker.instances.length).toBe(2);
        const leftWorker = MockWorker.instances[0];

        // 2. 파일 로드 호출
        const testFile = new File(['log data'], 'test.log', { type: 'text/plain' });
        act(() => {
            result.current.handleLeftFileChange(testFile);
        });

        // 3. 워커에게 INIT_FILE이 보내졌는지 확인 (handleLeftFileChange는 INIT_FILE을 보냄)
        expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'INIT_FILE'
        }));

        // 4. 워커가 Ready 상태가 아님을 확인 (로딩 중)
        expect(result.current.leftWorkerReady).toBe(false);

        // 5. 워커로부터 STREAM_DONE 응답 시뮬레이션
        act(() => {
            leftWorker.emitMessage({ type: 'STREAM_DONE' });
            leftWorker.emitMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        });

        // 6. 워커가 Ready 상태가 되고, 자동으로 FILTER_LOGS가 보내졌는지 확인
        await waitFor(() => {
            expect(result.current.leftWorkerReady).toBe(false); // 필터링 시작하면 다시 false가 됨
            expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'FILTER_LOGS',
                payload: expect.objectContaining({
                    id: 'rule-1'
                })
            }));
        });

        // 7. 필터링 완료 시뮬레이션
        act(() => {
            leftWorker.emitMessage({
                type: 'FILTER_COMPLETE',
                payload: { matchCount: 10, totalLines: 100 }
            });
            leftWorker.emitMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        });

        // 8. 최종 결과 확인
        await waitFor(() => {
            expect(result.current.leftWorkerReady).toBe(true);
            expect(result.current.leftFilteredCount).toBe(10);
            expect(result.current.leftTotalLines).toBe(100);
        });
    });

    it('[UT 2] should NOT filter before STREAM_DONE even if rules change', async () => {
        const { result, rerender } = renderHook((props) => useLogExtractorLogic(props), {
            initialProps: defaultProps
        });

        const leftWorker = MockWorker.instances[0];

        // 1. 파일 로드 시작
        const testFile = new File(['log data'], 'test.log', { type: 'text/plain' });
        act(() => {
            result.current.handleLeftFileChange(testFile);
        });
        leftWorker.postMessage.mockClear();

        // 2. 로딩 중에 필터 규칙 변경
        const newRules = [{ ...defaultProps.rules[0], includeGroups: [['FATAL']] }];
        rerender({ ...defaultProps, rules: newRules });

        // 3. 아직 Ready가 아니므로 FILTER_LOGS가 보내져서는 안 됨 (Serialized Flow)
        expect(leftWorker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
            type: 'FILTER_LOGS'
        }));

        // 4. 로딩 완료
        act(() => {
            leftWorker.emitMessage({ type: 'STREAM_DONE' });
            leftWorker.emitMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        });

        // 5. 완료 직후에만 FILTER_LOGS가 한 번 보내져야 함
        await waitFor(() => {
            expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'FILTER_LOGS',
                payload: expect.objectContaining({
                    includeGroups: [['FATAL']]
                })
            }));
        });
    });

    it('[UT 3] should show all lines when no filter is applied', async () => {
        const noFilterProps = {
            ...defaultProps,
            rules: [{ ...defaultProps.rules[0], includeGroups: [], excludes: [] }]
        };
        const { result } = renderHook(() => useLogExtractorLogic(noFilterProps));
        const leftWorker = MockWorker.instances[0];

        act(() => {
            result.current.handleLeftFileChange(new File(['...'], 'test.log'));
        });

        act(() => {
            leftWorker.emitMessage({ type: 'STREAM_DONE' });
            leftWorker.emitMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        });

        await waitFor(() => {
            expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'FILTER_LOGS',
                payload: expect.objectContaining({ includeGroups: [] })
            }));
        });
    });

    it('[UT 4] should re-filter when Quick Filter changes', async () => {
        const { result, rerender } = renderHook((props) => useLogExtractorLogic(props), {
            initialProps: defaultProps
        });
        const leftWorker = MockWorker.instances[0];

        // 1. Initial Load & Filter
        act(() => {
            result.current.handleLeftFileChange(new File(['...'], 'test.log'));
        });
        act(() => {
            leftWorker.emitMessage({ type: 'STREAM_DONE' });
            leftWorker.emitMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        });

        await waitFor(() => expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'FILTER_LOGS' })));

        // 필터 진행 중이므로 ready=false인 상태. 완료 시뮬레이션 필요.
        act(() => {
            leftWorker.emitMessage({ type: 'FILTER_COMPLETE', payload: { matchCount: 5 } });
            leftWorker.emitMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        });

        await waitFor(() => expect(result.current.leftWorkerReady).toBe(true));
        leftWorker.postMessage.mockClear();

        // 2. Change Quick Filter
        act(() => {
            result.current.setQuickFilter('error');
        });

        // 3. Should trigger FILTER_LOGS again with new quickFilter
        await waitFor(() => {
            expect(leftWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'FILTER_LOGS',
                payload: expect.objectContaining({ quickFilter: 'error' })
            }));
        });
    });
});
