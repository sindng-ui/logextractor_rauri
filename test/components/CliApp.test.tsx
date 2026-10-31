import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CliApp } from '../../CliApp';

describe('CliApp Renderer Entry', () => {
    let mockElectronAPI: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockElectronAPI = {
            onCliCommand: vi.fn().mockImplementation((cb) => {
                mockElectronAPI._triggerCliCommand = cb;
                return () => { };
            }),
            cliReady: vi.fn(),
            cliStdout: vi.fn(),
            cliStderr: vi.fn(),
            cliExit: vi.fn(),
            getCliSettings: vi.fn().mockResolvedValue(null),
            readFile: vi.fn(),
            saveFileDirect: vi.fn(),
            getFileSize: vi.fn(),
            readFileSegment: vi.fn(),
        };

        (window as any).electronAPI = mockElectronAPI;

        const localStorageMock = (() => {
            let store: any = {};
            return {
                getItem: (key: string) => store[key] || null,
                setItem: (key: string, value: string) => { store[key] = value.toString(); },
                removeItem: (key: string) => { delete store[key]; },
                clear: () => { store = {}; }
            };
        })();
        Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    });

    afterEach(() => {
        delete (window as any).electronAPI;
    });

    const renderCliApp = () => {
        return render(<CliApp />);
    };

    it('should initialize and notify main process that it is ready', () => {
        renderCliApp();
        expect(mockElectronAPI.onCliCommand).toHaveBeenCalled();
        expect(mockElectronAPI.cliReady).toHaveBeenCalled();
        expect(mockElectronAPI.cliStdout).toHaveBeenCalledWith('CLI Renderer Ready...\n');
        expect(screen.getByText(/Initializing CLI Mode.../i)).toBeInTheDocument();
    });

    it('should exit with error on unknown command', async () => {
        renderCliApp();

        await act(async () => {
            await mockElectronAPI._triggerCliCommand({ command: 'unknown-cmd', payload: {} });
        });

        expect(mockElectronAPI.cliStderr).toHaveBeenCalledWith('Unknown CLI command: unknown-cmd\n');
        expect(mockElectronAPI.cliExit).toHaveBeenCalledWith(1);
    });

    describe('analyze-diff', () => {
        it('should route analyze-diff command correctly', async () => {
            renderCliApp();

            mockElectronAPI.getCliSettings.mockResolvedValue({
                logRules: [{ name: 'mission1' }]
            });

            await act(async () => {
                await mockElectronAPI._triggerCliCommand({
                    command: 'analyze-diff',
                    payload: {
                        filterName: 'mission1',
                        leftPath: 'left.log',
                        rightPath: 'right.log',
                        outputPath: 'out.json',
                        cwd: '/mock'
                    }
                });
            });

            expect(mockElectronAPI.cliStdout).toHaveBeenCalledWith(expect.stringContaining('[Analyze Diff]'));
        });
    });
});
