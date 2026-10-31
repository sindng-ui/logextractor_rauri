import { renderHook, act } from '@testing-library/react';
import { useLogExtractorLogic } from '../../hooks/useLogExtractorLogic';
import { describe, it, expect, vi } from 'vitest';

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

vi.mock('../../contexts/HappyToolContext', () => ({
    useHappyTool: () => ({
        logRules: [],
        setLogRules: vi.fn(),
        handleExportSettings: vi.fn(),
        handleImportSettings: vi.fn(),
        isFocusMode: false
    }),
}));

// Mock Worker Registry
vi.mock('../../hooks/LogWorkerRegistry', () => ({
    workerRegistry: {
        getWorkers: vi.fn().mockReturnValue({
            left: { worker: { postMessage: vi.fn(), terminate: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }, ready: false, totalLines: 0, path: null },
            right: { worker: { postMessage: vi.fn(), terminate: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }, ready: false, totalLines: 0, path: null }
        }),
        terminateWorkers: vi.fn(),
        clearAll: vi.fn()
    }
}));

describe('useLogExtractorLogic Interface Integrity Check', () => {
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

    it('should export all required Tizen/Serial connection fields', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));
        
        // --- Tizen/Serial Connection Fields ---
        expect(result.current).toHaveProperty('tizenSocket');
        expect(result.current).toHaveProperty('handleTizenStreamStart');
        expect(result.current).toHaveProperty('handleTizenDisconnect');
        expect(result.current).toHaveProperty('sendTizenCommand');
        expect(result.current).toHaveProperty('sendSerialSpecialKey'); // 🐧🎯 This was missing!
        expect(result.current).toHaveProperty('connectionMode');
        expect(result.current).toHaveProperty('isLogging');
    });

    it('should export all required UI state fields', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        expect(result.current).toHaveProperty('isPanelOpen');
        expect(result.current).toHaveProperty('setIsPanelOpen');
        expect(result.current).toHaveProperty('configPanelWidth');
        expect(result.current).toHaveProperty('setConfigPanelWidth');
        expect(result.current).toHaveProperty('isSearchFocused');
        expect(result.current).toHaveProperty('setIsSearchFocused');
        expect(result.current).toHaveProperty('quickFilter');
        expect(result.current).toHaveProperty('setQuickFilter');
    });

    it('should export all required Log Viewer fields', () => {
        const { result } = renderHook(() => useLogExtractorLogic(defaultProps));

        expect(result.current).toHaveProperty('leftFileName');
        expect(result.current).toHaveProperty('rightFileName');
        expect(result.current).toHaveProperty('leftWorkerReady');
        expect(result.current).toHaveProperty('rightWorkerReady');
        expect(result.current).toHaveProperty('handleClearLogs');
        expect(result.current).toHaveProperty('handleLeftReset');
        expect(result.current).toHaveProperty('handleRightReset');
    });

    it('should emit disconnect_serial when unmounting with active tizenSocket', () => {
        const mockSocket = {
            emit: vi.fn(),
            disconnect: vi.fn(),
            on: vi.fn(),
            off: vi.fn()
        };

        const { result, unmount } = renderHook(() => useLogExtractorLogic(defaultProps));
        
        // Simulate connection
        act(() => {
            result.current.handleTizenStreamStart(mockSocket as any, 'test-device', 'serial');
        });

        // Unmount (close tab)
        unmount();

        // 🐧🎯 Check if disconnect_serial was emitted
        expect(mockSocket.emit).toHaveBeenCalledWith('disconnect_serial');
        expect(mockSocket.disconnect).toHaveBeenCalled();
    });
});
