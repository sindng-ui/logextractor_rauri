import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickCommandSection } from '../../components/LogViewer/ConfigSections/QuickCommandSection';
import ConfigurationPanel from '../../components/LogViewer/ConfigurationPanel';
import React from 'react';

// Mocking Contexts
const mockSetIsPanelOpen = vi.fn();
vi.mock('../../components/LogViewer/LogContext', () => ({
    useLogContext: () => ({
        isPanelOpen: true,
        setIsPanelOpen: mockSetIsPanelOpen,
        configPanelWidth: 400,
        handleConfigResizeStart: vi.fn(),
        currentConfig: { highlights: [], excludes: [] },
        updateCurrentRule: vi.fn(),
        groupedRoots: {},
        collapsedRoots: new Set(),
        setCollapsedRoots: vi.fn(),
        handleToggleRoot: vi.fn(),
        sendTizenCommand: vi.fn(),
        sendSerialSpecialKey: vi.fn(),
        logViewPreferences: { fontSize: 13, rowHeight: 20 },
        updateLogViewPreferences: vi.fn(),
        isLogging: false,
        setIsLogging: vi.fn(),
        connectionMode: 'sdb',
        hasEverConnected: true,
        setIsTizenQuickConnect: vi.fn(),
        setIsTizenModalOpen: vi.fn(),
        tizenSocket: null,
        tabId: 'test-tab',
        isActive: true
    })
}));

// Mocking Sub-sections to isolate ConfigurationPanel
vi.mock('../../components/LogViewer/ConfigSections/ConfigHeader', () => ({ ConfigHeader: () => <div /> }));
vi.mock('../../components/LogViewer/ConfigSections/HappyComboSection', () => ({ HappyComboSection: () => <div /> }));
vi.mock('../../components/LogViewer/ConfigSections/BlockListSection', () => ({ BlockListSection: () => <div /> }));
vi.mock('../../components/LogViewer/ConfigSections/HighlightSection', () => ({ HighlightSection: () => <div /> }));
vi.mock('../../components/LogViewer/ConfigSections/LogSettingsSection', () => ({ LogSettingsSection: () => <div /> }));
vi.mock('../../components/LogViewer/ConfigSections/PerfSettingsSection', () => ({ PerfSettingsSection: () => <div /> }));
vi.mock('../../components/LogViewer/ConfigSections/ViewSettingsSection', () => ({ ViewSettingsSection: () => <div /> }));
// QuickCommandSection은 실제 본체를 테스트하기 위해 모킹하지 않음

vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('../../contexts/CommandContext', () => ({ useCommand: () => ({ registerCommand: vi.fn(), unregisterCommand: vi.fn() }) }));
vi.mock('../../contexts/HappyToolContext', () => ({ useHappyTool: () => ({ settings: { theme: 'dark' }, updateSettings: vi.fn(), configActiveTab: 'settings', setConfigActiveTab: vi.fn() }) }));
vi.mock('../../components/LogArchive', () => ({ useLogArchiveContext: () => ({ openSidebar: vi.fn() }), LogArchiveProvider: ({ children }: any) => <>{children}</> }));

// Mocking Framer Motion
vi.mock('framer-motion', () => ({
    Reorder: {
        Group: ({ children }: any) => <div data-testid="reorder-group">{children}</div>,
        Item: ({ children }: any) => <div data-testid="reorder-item">{children}</div>,
    },
    useDragControls: () => ({ start: vi.fn() }),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
        div: (props: any) => <div {...props} />,
        span: (props: any) => <span {...props} />,
        button: (props: any) => <button {...props} />,
        nav: (props: any) => <nav {...props} />,
        header: (props: any) => <header {...props} />,
        section: (props: any) => <section {...props} />,
    }
}));

describe('QuickCommand Performance & Logic UT', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    describe('QuickCommandSection Logic', () => {
        it('should render commands from localStorage', () => {
            const mockCommands = [{ id: '1', name: 'Test Cmd', cmd: 'ls' }];
            localStorage.setItem('quickCommands', JSON.stringify(mockCommands));
            
            render(<QuickCommandSection isConnected={true} onExecute={vi.fn()} />);
            
            expect(screen.getByText('Test Cmd')).toBeDefined();
        });

        it('should NOT have heavy GPU elements like backdrop-blur', () => {
            render(<QuickCommandSection isConnected={true} onExecute={vi.fn()} />);
            
            const divs = document.querySelectorAll('div');
            divs.forEach(div => {
                expect(div.className).not.toContain('backdrop-blur');
            });
        });
    });

    describe('ConfigurationPanel Performance', () => {
        it('should toggle tab on Ctrl+Shift+Z', () => {
            render(<ConfigurationPanel />);
            
            fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
            expect(mockSetIsPanelOpen).toHaveBeenCalledWith(true);
        });

        it('should NOT have backdrop-blur or heavy shadows', () => {
            const { container } = render(<ConfigurationPanel />);
            
            // Background check
            const bg = container.querySelector('.bg-slate-950\\/40');
            if (bg) expect(bg.className).not.toContain('backdrop-blur');

            // Shadow check
            const indicators = document.querySelectorAll('.rounded-md');
            indicators.forEach(i => {
                expect(i.className).not.toContain('shadow-lg');
            });
        });
    });
});

