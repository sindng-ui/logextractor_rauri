import React, { useState, useEffect, useCallback, memo } from 'react';
import { X, Server, Terminal, RefreshCw, Wifi, Usb, ShieldAlert, Settings, Zap } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { createLogStreamSocket } from '../utils/tauriSocket';

interface TizenConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStreamStart: (socket: any, deviceName: string, mode: 'sdb' | 'ssh' | 'serial' | 'test', saveToFile: boolean) => void;
    isConnected?: boolean;
    onDisconnect?: () => void;
    currentConnectionInfo?: string | null;
    isQuickConnect?: boolean; // New prop
    logCommand?: string; // New prop for custom SDB command
    tags?: string[]; // Optional tags for substitution
}

const TizenConnectionModal: React.FC<TizenConnectionModalProps> = memo(({
    isOpen, onClose, onStreamStart,
    isConnected: isExternalConnected,
    onDisconnect: onExternalDisconnect,
    currentConnectionInfo,
    isQuickConnect,
    logCommand,
    tags
}) => {
    // Persist last used mode
    const [mode, setMode] = useState<'ssh' | 'sdb' | 'serial' | 'test'>(() => (localStorage.getItem('lastConnectionMode') as any) || 'sdb');
    const [socket, setSocket] = useState<Socket | null>(null);

    // SSH State
    const [sshHost, setSshHost] = useState(() => localStorage.getItem('sshHost') || '');
    const [sshPort, setSshPort] = useState(() => localStorage.getItem('sshPort') || '22');
    const [sshUser, setSshUser] = useState(() => localStorage.getItem('sshUser') || 'root');
    const [sshPassword, setSshPassword] = useState(() => localStorage.getItem('sshPassword') || '');

    // Serial State
    const [serialPort, setSerialPort] = useState(() => localStorage.getItem('serialPort') || '');
    const [baudRate, setBaudRate] = useState(() => localStorage.getItem('serialBaudRate') || '115200');
    const [serialPorts, setSerialPorts] = useState<{ path: string, manufacturer?: string }[]>([]);
    const [isSerialLoading, setIsSerialLoading] = useState(false);

    // Persist Settings
    useEffect(() => { localStorage.setItem('sshHost', sshHost); }, [sshHost]);
    useEffect(() => { localStorage.setItem('sshPort', sshPort); }, [sshPort]);
    useEffect(() => { localStorage.setItem('sshUser', sshUser); }, [sshUser]);
    useEffect(() => { localStorage.setItem('sshPassword', sshPassword); }, [sshPassword]);
    useEffect(() => { localStorage.setItem('serialPort', serialPort); }, [serialPort]);
    useEffect(() => { localStorage.setItem('serialBaudRate', baudRate); }, [baudRate]);

    // SDB State
    const [sdbPath, setSdbPath] = useState(() => localStorage.getItem('tizen_sdb_path') || '');
    const [sdbDevices, setSdbDevices] = useState<{ id: string, type: string }[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState(() => localStorage.getItem('lastSdbDeviceId') || '');
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => { localStorage.setItem('lastSdbDeviceId', selectedDeviceId); }, [selectedDeviceId]);
    const [debugMode, setDebugMode] = useState(false);

    // Persist Save to File preference
    const [saveToFile, setSaveToFile] = useState(() => localStorage.getItem('tizen_auto_save_logs') === 'true');
    useEffect(() => {
        localStorage.setItem('tizen_auto_save_logs', String(saveToFile));
    }, [saveToFile]);

    // Connection Status
    const [status, setStatus] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    // ⚡ Socket readiness & Quick Connect UI visibility state
    const [isSocketReady, setIsSocketReady] = useState(false);
    const [showQuickConnectUI, setShowQuickConnectUI] = useState(!!isQuickConnect);

    // Sync showQuickConnectUI when modal opens or isQuickConnect prop changes
    useEffect(() => {
        if (isOpen) {
            setShowQuickConnectUI(!!isQuickConnect);
        }
    }, [isOpen, isQuickConnect]);

    const isHandedOver = React.useRef(false);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const startTimeout = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setIsConnecting(false);
            setIsScanning(false);
            setIsSerialLoading(false);
            setStatus('Connection timed out (12s). Please try again.');
            setError('Request timed out (12s). Please check your connection.');
        }, 12000);
    };

    const clearConnectionTimeout = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const refreshSerialPorts = useCallback(() => {
        if (socket) {
            setIsSerialLoading(true);
            socket.emit('list_serial_ports');
        }
    }, [socket]);

    useEffect(() => {
        let newSocket: Socket | null = null;

        if (isOpen) {
            setIsConnecting(false);
            setError('');
            setStatus('');
            setIsScanning(false);
            setIsSocketReady(false);
            isHandedOver.current = false;
            newSocket = createLogStreamSocket('http://127.0.0.1:3003');

            newSocket.on('connect', () => {
                console.log('[TizenModal] ✓ Socket connected');
                setStatus('Connected to Local Log Server');
                setIsSocketReady(true);
                if (mode === 'serial') {
                    newSocket?.emit('list_serial_ports');
                }
            });

            newSocket.on('serial_ports', (ports) => {
                console.log('[TizenModal] Serial ports received:', ports);
                setSerialPorts(ports);
                setIsSerialLoading(false);
                if (ports.length > 0 && !serialPort) {
                    setSerialPort(ports[0].path);
                }
            });

            newSocket.on('serial_status', (data) => {
                console.log('[TizenModal] Serial status:', data);
                clearConnectionTimeout();
                setStatus(data.message);
                if (data.status === 'connected') {
                    setIsConnected(true);
                    isHandedOver.current = true;
                    onStreamStart(newSocket!, `SERIAL:${serialPort}`, 'serial', saveToFile);
                    onClose();
                } else if (data.status === 'disconnected') {
                    setIsConnected(false);
                }
                setIsConnecting(false);
            });

            newSocket.on('serial_error', (data) => {
                console.error('[TizenModal] Serial error:', data);
                clearConnectionTimeout();
                setError(data.message);
                setIsConnecting(false);
            });

            newSocket.on('sdb_devices', (devices) => {
                setSdbDevices(devices);
                setIsScanning(false);
                if (devices.length > 0 && !selectedDeviceId) setSelectedDeviceId(devices[0].id);
            });

            newSocket.on('ssh_status', (data) => {
                clearConnectionTimeout();
                setStatus(data.message);
                if (data.status === 'connected') {
                    setIsConnected(true);
                    isHandedOver.current = true;
                    onStreamStart(newSocket!, `SSH:${sshHost}`, 'ssh', saveToFile);
                    onClose();
                } else if (data.status === 'disconnected') {
                    setIsConnected(false);
                }
                setIsConnecting(false);
            });

            newSocket.on('sdb_status', (data) => {
                clearConnectionTimeout();
                setStatus(data.message);
                if (data.status === 'connected') {
                    setIsConnected(true);
                    isHandedOver.current = true;
                    onStreamStart(newSocket!, `SDB:${selectedDeviceId || 'Default'}`, 'sdb', saveToFile);
                    onClose();
                } else if (data.status !== 'reconnecting') {
                    setIsConnecting(false);
                    if (data.status === 'disconnected') setIsConnected(false);
                }
            });

            newSocket.on('ssh_error', (data) => {
                clearConnectionTimeout();
                setError(data.message);
                setIsConnecting(false);
            });

            newSocket.on('sdb_error', (data) => {
                clearConnectionTimeout();
                let msg = data.message;
                if (msg && (msg.includes('spawn sdb ENOENT') || msg.includes('not recognized'))) {
                    msg = "SDB command not found. Please add 'sdb' to system PATH.";
                }
                setError(msg);
                setIsConnecting(false);
            });

            setSocket(newSocket);
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (newSocket) {
                if (!isHandedOver.current) newSocket.disconnect();
                setSocket(null);
                setIsSocketReady(false);
            }
        };
    }, [isOpen]);

    const handleConnect = useCallback(() => {
        if (!socket) return;
        setError('');
        setIsConnecting(true);
        startTimeout();
        localStorage.setItem('lastConnectionMode', mode);

        if (mode === 'test') {
            socket.emit('start_scroll_stream');
            setIsConnected(true);
            isHandedOver.current = true;
            onStreamStart(socket, 'TEST:Simulated Stream', 'test', false);
            onClose();
            return;
        }

        if (mode === 'serial') {
            socket.emit('connect_serial', {
                port: serialPort,
                baudRate: parseInt(baudRate),
                saveToFile,
                debug: debugMode
            });
        } else if (mode === 'ssh') {
            socket.emit('connect_ssh', {
                host: sshHost,
                port: parseInt(sshPort),
                username: sshUser,
                password: sshPassword,
                debug: debugMode,
                saveToFile,
                command: logCommand,
                tags: tags || []
            });
        } else {
            socket.emit('connect_sdb', {
                deviceId: selectedDeviceId || undefined,
                debug: debugMode,
                saveToFile,
                command: logCommand,
                tags: tags || [],
                sdbPath
            });
        }
    }, [socket, mode, sshHost, sshPort, sshUser, sshPassword, serialPort, baudRate, debugMode, saveToFile, logCommand, tags, sdbPath, selectedDeviceId, onStreamStart, onClose]);

    const handleDisconnect = useCallback(() => {
        if (!socket) return;
        setIsConnecting(true);
        if (mode === 'serial') socket.emit('disconnect_serial');
        else if (mode === 'ssh') socket.emit('disconnect_ssh');
        else socket.emit('disconnect_sdb');
        setIsConnected(false);
        setIsConnecting(false);
        setStatus('Disconnected');
    }, [socket, mode]);

    // ⚡ Helper to get reader-friendly connection target details
    const getConnectionString = useCallback(() => {
        if (mode === 'sdb') {
            return `SDB (Device: ${selectedDeviceId || 'Auto-detect'})`;
        } else if (mode === 'ssh') {
            return `SSH (Host: ${sshHost || 'N/A'}:${sshPort || '22'})`;
        } else if (mode === 'serial') {
            return `Serial (Port: ${serialPort || 'N/A'}, Baud: ${baudRate})`;
        } else if (mode === 'test') {
            return `Simulation Mode`;
        }
        return '';
    }, [mode, selectedDeviceId, sshHost, sshPort, serialPort, baudRate]);

    // ⚡ Auto-connect for Quick Connect when modal opens and socket is ready
    useEffect(() => {
        if (isOpen && isQuickConnect && showQuickConnectUI && socket && isSocketReady && !isConnected && !isConnecting && !error) {
            console.log('[TizenConnectionModal] ⚡ Quick Connect Triggered! Auto-connecting with mode:', mode);
            handleConnect();
        }
    }, [isOpen, isQuickConnect, showQuickConnectUI, socket, isSocketReady, isConnected, isConnecting, error, mode, handleConnect]);

    if (!isOpen) return null;
    const effectiveIsConnected = isExternalConnected ?? isConnected;
    const effectiveStatus = isExternalConnected ? 'Connected' : status;

    // ⚡ Early return for premium Quick Connect interface
    if (showQuickConnectUI && !effectiveIsConnected) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-[500px] h-[380px] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150 transition-all">
                    {/* Header */}
                    <div className="bg-slate-950 p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Server size={18} className="text-indigo-500" /> Tizen Quick Connect
                        </h2>
                        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 flex flex-col p-6 items-center justify-center text-center space-y-6 overflow-hidden">
                        {error ? (
                            /* Error Panel */
                            <div className="w-full flex flex-col items-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-red-950/30 border border-red-500/30 flex items-center justify-center text-red-500">
                                    <ShieldAlert size={32} />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-slate-200">Unable to establish a connection</h3>
                                    <p className="text-[10px] text-indigo-400 font-mono">{getConnectionString()}</p>
                                </div>
                                <div className="w-full bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl max-h-[100px] overflow-y-auto text-left custom-scrollbar">
                                    <p className="text-[10px] font-mono text-red-400 leading-normal break-all">{error}</p>
                                </div>
                                <div className="w-full flex gap-3 pt-2">
                                    <button
                                        onClick={() => setShowQuickConnectUI(false)}
                                        className="flex-1 py-3 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all active:scale-[0.98]"
                                    >
                                        Switch to Manual Settings
                                    </button>
                                    <button
                                        onClick={() => {
                                            setError('');
                                            setIsConnecting(true);
                                            handleConnect();
                                        }}
                                        className="flex-1 py-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-900/40 transition-all active:scale-[0.98]"
                                    >
                                        Retry
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Loading Panel */
                            <div className="w-full flex flex-col items-center space-y-6">
                                <div className="relative">
                                    <div className="absolute inset-0 rounded-full bg-yellow-500/10 blur-sm animate-ping" />
                                    <div className="relative w-16 h-16 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-yellow-500 shadow-xl">
                                        <Zap size={32} className="animate-bounce" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-sm font-bold text-slate-200 animate-pulse">Automatically connecting to last settings...</h3>
                                    <div className="inline-flex items-center gap-2 bg-indigo-950/30 border border-indigo-500/20 px-4 py-1.5 rounded-full text-[10px] font-mono text-indigo-400">
                                        <Terminal size={10} />
                                        <span>{getConnectionString()}</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500">
                                    Waiting for a socket connection. Please wait a moment.
                                </p>
                                <button
                                    onClick={() => setShowQuickConnectUI(false)}
                                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors underline pt-2"
                                >
                                    Switch to Manual Settings
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-[500px] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150 transition-all ${effectiveIsConnected ? 'h-[380px]' : 'h-[580px]'}`}>
                <div className="bg-slate-950 p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Server size={18} className="text-indigo-500" /> Tizen Connection
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
                </div>

                <div className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden">
                    {!effectiveIsConnected && !isQuickConnect && (
                        <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800 shrink-0">
                            {[
                                { id: 'sdb', label: 'SDB', icon: Usb },
                                { id: 'ssh', label: 'SSH', icon: Wifi },
                                { id: 'serial', label: 'Serial', icon: Settings },
                                { id: 'test', label: 'Simulate', icon: RefreshCw }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setMode(tab.id as any);
                                        if (tab.id === 'serial') refreshSerialPorts();
                                    }}
                                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold transition-all duration-200 ${mode === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <tab.icon size={13} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {!effectiveIsConnected && (
                        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-4">
                                {mode === 'serial' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="flex justify-between items-end mb-1.5">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Port</label>
                                                    <button onClick={refreshSerialPorts} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                                                        <RefreshCw size={10} className={isSerialLoading ? 'animate-spin' : ''} /> Refresh
                                                    </button>
                                                </div>
                                                <select
                                                    className="w-full bg-slate-950 text-slate-200 p-2.5 rounded-xl border border-slate-800 focus:border-indigo-500/50 focus:outline-none transition-all text-xs font-mono"
                                                    value={serialPort}
                                                    onChange={e => setSerialPort(e.target.value)}
                                                >
                                                    {serialPorts.length === 0 && <option value="">No ports found</option>}
                                                    {serialPorts.map(p => (
                                                        <option key={p.path} value={p.path}>{p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Baud Rate</label>
                                                <input
                                                    className="w-full bg-slate-950 text-slate-200 p-2.5 rounded-xl border border-slate-800 focus:border-indigo-500/50 focus:outline-none transition-all font-mono text-xs"
                                                    value={baudRate}
                                                    onChange={e => setBaudRate(e.target.value)}
                                                    placeholder="115200"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {mode === 'sdb' && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-end">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Select Device</label>
                                            <button onClick={() => socket?.emit('list_sdb_devices')} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 uppercase">
                                                <RefreshCw size={12} /> Rescan
                                            </button>
                                        </div>
                                        <select
                                            className="w-full bg-slate-800 text-slate-200 p-3 rounded-xl border border-slate-700 focus:border-indigo-500 focus:outline-none transition-all text-sm"
                                            value={selectedDeviceId}
                                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                                        >
                                            <option value="">Auto-detect</option>
                                            {sdbDevices.map(d => <option key={d.id} value={d.id}>{d.id} ({d.type})</option>)}
                                        </select>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">SDB Path</label>
                                            <input
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-300 focus:border-indigo-500/50 outline-none"
                                                value={sdbPath}
                                                onChange={e => setSdbPath(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}

                                {mode === 'ssh' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Host IP</label>
                                                <input className="w-full bg-slate-950 text-slate-200 p-2.5 rounded-xl border border-slate-800 focus:border-indigo-500/50 outline-none font-mono text-xs" value={sshHost} onChange={e => setSshHost(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Port</label>
                                                <input className="w-full bg-slate-950 text-slate-200 p-2.5 rounded-xl border border-slate-800 focus:border-indigo-500/50 outline-none font-mono text-center text-xs" value={sshPort} onChange={e => setSshPort(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Username</label>
                                                <input className="w-full bg-slate-950 text-slate-200 p-2.5 rounded-xl border border-slate-800 focus:border-indigo-500/50 outline-none font-mono text-xs" value={sshUser} onChange={e => setSshUser(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Password</label>
                                                <input type="password" className="w-full bg-slate-950 text-slate-200 p-2.5 rounded-xl border border-slate-800 focus:border-indigo-500/50 outline-none font-mono text-xs" value={sshPassword} onChange={e => setSshPassword(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {mode === 'test' && (
                                    <div className="p-6 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700 text-center space-y-2">
                                        <RefreshCw size={24} className="text-indigo-400 mx-auto" />
                                        <h3 className="text-slate-200 font-bold text-sm">Simulation Mode</h3>
                                        <p className="text-[10px] text-slate-400">Generates 10 lines/sec virtual stream.</p>
                                    </div>
                                )}

                                <div className="flex flex-col gap-2.5 pt-2">
                                    <label className="flex items-center gap-2.5 text-[10px] font-bold text-slate-500 cursor-pointer hover:text-slate-300 uppercase tracking-tight">
                                        <input type="checkbox" checked={debugMode} onChange={e => setDebugMode(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                                        <span>Debug Mode (Server Save)</span>
                                    </label>
                                    <label className="flex items-center gap-2.5 text-[10px] font-bold text-slate-500 cursor-pointer hover:text-slate-300 uppercase tracking-tight">
                                        <input type="checkbox" checked={saveToFile} onChange={e => setSaveToFile(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                                        <span>Auto Save to Local File</span>
                                    </label>
                                </div>
                            </div>

                            <div className="h-[50px] bg-slate-950/80 rounded-2xl px-5 flex flex-col items-center justify-center border border-slate-800 shrink-0">
                                {error ? (
                                    <div className="text-red-400 text-[10px] flex items-start gap-2 w-full">
                                        <ShieldAlert size={12} className="shrink-0" />
                                        <span className="truncate">{error}</span>
                                    </div>
                                ) : (
                                    <span className={`text-indigo-400 text-[10px] font-mono flex items-center gap-2 ${effectiveStatus ? 'animate-pulse' : ''}`}>
                                        <Terminal size={12} /> {effectiveStatus || "READY"}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {effectiveIsConnected && (
                        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                            <div className="bg-indigo-950/20 border border-indigo-500/20 p-8 rounded-2xl text-center w-full max-w-[340px]">
                                <Wifi size={32} className="text-indigo-500 animate-pulse mx-auto mb-4" />
                                <h3 className="text-indigo-400 text-[10px] font-bold mb-2 uppercase tracking-widest">Active Stream</h3>
                                <p className="text-[11px] text-slate-400 font-mono bg-slate-950/50 py-2 rounded-xl">{currentConnectionInfo || mode}</p>
                            </div>
                        </div>
                    )}

                    <div className="shrink-0">
                        <button
                            onClick={effectiveIsConnected ? (onExternalDisconnect || handleDisconnect) : handleConnect}
                            disabled={isConnecting}
                            className={`w-full py-3.5 text-xs font-extrabold rounded-2xl shadow-xl transition-all active:scale-[0.98] ${effectiveIsConnected ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                        >
                            {effectiveIsConnected ? 'DISCONNECT SESSION' : 'CONNECT & START STREAM'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default TizenConnectionModal;
