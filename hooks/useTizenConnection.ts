import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { LogRule } from '../types';
import { assembleIncludeGroups } from '../utils/filterGroupUtils';

interface TizenConnectionProps {
    leftWorkerRef: React.MutableRefObject<Worker | null>;
    rules: LogRule[];
    selectedRuleId: string;
    quickFilter: 'none' | 'error' | 'exception';
    addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    // UI State & Getters
    leftFileName: string | null;
    setLeftFileName: (name: string | null) => void;
    setLeftFilePath: (path: string) => void;
    setLeftWorkerReady: (ready: boolean) => void;
    setLeftIndexingProgress: (progress: number) => void;
    setLeftTotalLines: (total: number) => void;
    setLeftFilteredCount: (count: number) => void;
    setActiveLineIndexLeft: (index: number) => void;
    setSelectedIndicesLeft: (indices: Set<number>) => void;
    setLeftBookmarks: (bookmarks: Set<number>) => void;
}

/**
 * Tizen (SDB/SSH/Serial) 소켓 연결 및 로그 스트리밍을 전담하는 훅.
 */
export function useTizenConnection({
    leftWorkerRef,
    rules,
    selectedRuleId,
    quickFilter,
    addToast,
    leftFileName,
    setLeftFileName,
    setLeftFilePath,
    setLeftWorkerReady,
    setLeftIndexingProgress,
    setLeftTotalLines,
    setLeftFilteredCount,
    setActiveLineIndexLeft,
    setSelectedIndicesLeft,
    setLeftBookmarks
}: TizenConnectionProps) {
    const [tizenSocket, setTizenSocket] = useState<Socket | null>(null);
    const [connectionMode, setConnectionMode] = useState<'sdb' | 'ssh' | 'serial' | null>(null);
    const [isLogging, setIsLogging] = useState(false);
    const [hasEverConnected, setHasEverConnected] = useState(false);
    const [clearCacheTick, setClearCacheTick] = useState(0);

    const tizenBuffer = useRef<string[]>([]);
    const tizenBufferTimeout = useRef<NodeJS.Timeout | null>(null);
    const isWaitingForSshAuth = useRef(false);
    const shouldAutoScroll = useRef(true);

    // 버퍼의 로그를 Worker로 전송
    const flushTizenBuffer = useCallback(() => {
        const MAX_CHUNK_TEXT_SIZE = 1024 * 512;
        if (tizenBuffer.current.length === 0) return;

        const chunksToProcess: string[] = [];
        let currentSize = 0;

        while (tizenBuffer.current.length > 0 && currentSize < MAX_CHUNK_TEXT_SIZE) {
            const chunk = tizenBuffer.current.shift();
            if (chunk) {
                chunksToProcess.push(chunk);
                currentSize += chunk.length;
            }
        }

        if (chunksToProcess.length > 0) {
            const combined = chunksToProcess.join('');
            leftWorkerRef.current?.postMessage({ type: 'PROCESS_CHUNK', payload: combined });
        }

        if (tizenBuffer.current.length > 0) {
            requestAnimationFrame(() => flushTizenBuffer());
        }
    }, [leftWorkerRef]);

    // 스트림 시작 핸들러
    const handleTizenStreamStart = useCallback((socket: Socket, deviceName: string, mode: 'sdb' | 'ssh' | 'serial' | 'test' = 'sdb') => {
        setHasEverConnected(true);
        setTizenSocket(socket);
        setLeftFileName(deviceName);
        setLeftFilePath('');
        setLeftWorkerReady(false);
        setLeftIndexingProgress(0);
        setLeftTotalLines(0);
        setLeftFilteredCount(0);
        setActiveLineIndexLeft(-1);
        setSelectedIndicesLeft(new Set());
        shouldAutoScroll.current = true;
        setConnectionMode(mode === 'test' ? null : mode as 'sdb' | 'ssh' | 'serial');
        setIsLogging(false); // 연결 완료 후 자동으로 로그 커맨드가 실행되지 않고 대기하도록 false 지정 🐧⚡

        leftWorkerRef.current?.postMessage({ type: 'INIT_STREAM', payload: { isLive: true } });

        const config = rules.find(r => r.id === selectedRuleId);
        if (config) {
            const refined = assembleIncludeGroups(config);
            leftWorkerRef.current?.postMessage({
                type: 'FILTER_LOGS',
                payload: { ...config, includeGroups: refined, quickFilter }
            });
        }

        socket.on('log_data', (data: any) => {
            const chunk = typeof data === 'string' ? data : (data.chunk || data.log || JSON.stringify(data));
            tizenBuffer.current.push(chunk);

            const MAX_BUFFER_SIZE = 100;
            const BUFFER_TIMEOUT_MS = 32;

            if (tizenBuffer.current.length >= MAX_BUFFER_SIZE) {
                if (tizenBufferTimeout.current) {
                    clearTimeout(tizenBufferTimeout.current);
                    tizenBufferTimeout.current = null;
                }
                flushTizenBuffer();
                return;
            }

            if (!tizenBufferTimeout.current) {
                tizenBufferTimeout.current = setTimeout(() => {
                    flushTizenBuffer();
                    tizenBufferTimeout.current = null;
                }, BUFFER_TIMEOUT_MS);
            }
        });

        socket.on('ssh_auth_request', (data: { prompt: string, echo: boolean }) => {
            isWaitingForSshAuth.current = true;
            addToast(`SSH Auth Input Required: ${data.prompt}`, 'info');
        });

        socket.on('ssh_error', (data: { message: string }) => {
            addToast(`SSH Error: ${data.message}`, 'error');
            tizenBuffer.current.push(`[SSH ERROR] ${data.message}\n`);
            flushTizenBuffer();
        });

        socket.on('serial_error', (data: { message: string }) => {
            addToast(`Serial Error: ${data.message}`, 'error');
            tizenBuffer.current.push(`[SERIAL ERROR] ${data.message}\n`);
            flushTizenBuffer();
        });

        socket.on('disconnect', () => {
            setTizenSocket(null);
            isWaitingForSshAuth.current = false;
            setConnectionMode(null);
            setIsLogging(false);
        });

        const handleLogicalDisconnect = (data: { status: string }) => {
            if (data.status === 'disconnected') {
                setTizenSocket(null);
                setConnectionMode(null);
                setIsLogging(false);
            }
        };

        socket.on('sdb_status', handleLogicalDisconnect);
        socket.on('ssh_status', handleLogicalDisconnect);
        socket.on('serial_status', handleLogicalDisconnect);
    }, [rules, selectedRuleId, quickFilter, addToast, leftWorkerRef, setLeftFileName, setLeftFilePath, setLeftWorkerReady, setLeftIndexingProgress, setLeftTotalLines, setLeftFilteredCount, setActiveLineIndexLeft, setSelectedIndicesLeft, flushTizenBuffer]);

    // 로그 및 디바이스 버퍼 비우기
    const handleClearLogs = useCallback(() => {
        if (tizenSocket) {
            if (connectionMode === 'sdb') {
                tizenSocket.emit('sdb_clear', { deviceId: leftFileName });
            } else if (connectionMode === 'ssh') {
                tizenSocket.emit('ssh_clear');
            } else if (connectionMode === 'serial') {
                // Serial clearing normally clears UI
            }
        }

        if (leftWorkerRef.current) {
            setLeftTotalLines(0);
            setLeftFilteredCount(0);
            setActiveLineIndexLeft(-1);
            setSelectedIndicesLeft(new Set());
            setLeftBookmarks(new Set());
            setClearCacheTick(t => t + 1);
            tizenBuffer.current = [];
            leftWorkerRef.current.postMessage({ type: 'INIT_STREAM' });
        }
    }, [tizenSocket, connectionMode, leftFileName, leftWorkerRef, setLeftTotalLines, setLeftFilteredCount, setActiveLineIndexLeft, setSelectedIndicesLeft, setLeftBookmarks]);

    const sendTizenCommand = useCallback((cmd: string) => {
        if (tizenSocket) {
            if (isWaitingForSshAuth.current) {
                tizenSocket.emit('ssh_auth_response', cmd.replace(/\n$/, ''));
                isWaitingForSshAuth.current = false;
            } else {
                if (connectionMode === 'sdb') {
                    tizenSocket.emit('sdb_write', cmd);
                } else if (connectionMode === 'ssh') {
                    tizenSocket.emit('ssh_write', cmd);
                } else if (connectionMode === 'serial') {
                    tizenSocket.emit('serial_write', cmd);
                } else {
                    tizenSocket.emit('sdb_write', cmd);
                }
            }
        }
    }, [tizenSocket, connectionMode]);
    
    const sendSerialSpecialKey = useCallback((key: 'ctrl_p' | 'ctrl_c' | 'ctrl_p_thrice') => {
        if (tizenSocket && connectionMode === 'serial') {
            tizenSocket.emit('serial_special_key', key);
        }
    }, [tizenSocket, connectionMode]);

    const handleTizenDisconnect = useCallback(() => {
        if (tizenSocket) {
            tizenSocket.emit('disconnect_sdb');
            tizenSocket.emit('disconnect_ssh');
            tizenSocket.emit('disconnect_serial');
            setTimeout(() => {
                tizenSocket.disconnect();
                setTizenSocket(null);
            }, 100);
        }
    }, [tizenSocket]);

    useEffect(() => {
        return () => {
            if (tizenSocket) {
                tizenSocket.emit('disconnect_sdb');
                tizenSocket.emit('disconnect_ssh');
                tizenSocket.emit('disconnect_serial');
                tizenSocket.disconnect();
            }
        };
    }, [tizenSocket]);

    return {
        tizenSocket,
        setTizenSocket,
        connectionMode,
        isLogging,
        setIsLogging,
        hasEverConnected,
        shouldAutoScroll,
        clearCacheTick,
        setClearCacheTick,
        handleTizenStreamStart,
        sendTizenCommand,
        sendSerialSpecialKey,
        handleClearLogs,
        handleTizenDisconnect
    };
}
