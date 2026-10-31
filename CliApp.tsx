import React, { useEffect, useState } from 'react';
import { useCliHandlers } from './hooks/useCliHandlers';

export const CliApp: React.FC = () => {
    const [status, setStatus] = useState('Initializing CLI Mode...');
    const {
        logOut,
        logErr,
        handleLogExtractor,
        handleAnalyzeDiff
    } = useCliHandlers();

    useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.onCliCommand) {
            console.error('[CLI] Electron API or onCliCommand is missing');
            return;
        }

        const exit = (code: number = 0) => {
            window.electronAPI!.cliExit(code);
        };

        const unsubscribe = window.electronAPI.onCliCommand(async (data: any) => {
            try {
                const { command, payload } = data;
                setStatus(`Executing CLI Command: ${command}`);

                if (command === 'log-extractor') {
                    await handleLogExtractor(payload, logOut, logErr);
                    exit(0);
                } else if (command === 'analyze-diff') {
                    await handleAnalyzeDiff(payload, logOut, logErr);
                    exit(0);
                } else {
                    logErr(`Unknown CLI command: ${command}`);
                    exit(1);
                }
            } catch (error: any) {
                logErr(`[CLI Error] ${error.message}`);
                exit(1);
            }
        });

        // Tell main we are ready
        window.electronAPI.cliReady();
        window.electronAPI.cliStdout('CLI Renderer Ready...\n');

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [handleAnalyzeDiff, handleLogExtractor, logErr, logOut]);

    return (
        <div style={{ padding: 20, background: '#000', color: '#0f0', fontFamily: 'monospace', height: '100vh', width: '100vw' }}>
            <h1>HappyTool CLI Runner (Hidden window)</h1>
            <p>Status: {status}</p>
            <p>This window handles IndexedDB and WASM capabilities in the background.</p>
        </div>
    );
};

export default CliApp;
