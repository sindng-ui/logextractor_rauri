import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { io, Socket } from 'socket.io-client';
import { isTauriEnvironment } from './tauriBridge';

type EventHandler = (...args: any[]) => void;

/**
 * Native Tauri Socket Adapter mirroring `socket.io-client` API.
 * In Tauri desktop runtime, routes SDB / SSH / Serial / Simulation directly through
 * Rust commands & Tauri events (no external Node process or port 3003 required).
 * In standalone browser mode (`npm run dev`), falls back cleanly to `socket.io-client`.
 */
export class HybridTauriSocket {
    public id: string = `tauri-sock-${Math.random().toString(36).slice(2, 8)}`;
    public connected: boolean = false;
    private ioSocket: Socket | null = null;
    private listeners: Map<string, Set<EventHandler>> = new Map();
    private tauriUnlisteners: UnlistenFn[] = [];
    private isNativeMode: boolean = false;
    private disposed: boolean = false;

    constructor(url: string = 'http://127.0.0.1:3003') {
        if (isTauriEnvironment()) {
            this.initNativeMode();
            return;
        }

        this.ioSocket = io(url, {
            reconnectionAttempts: 2,
            timeout: 2500,
        });

        this.ioSocket.on('connect', () => {
            this.connected = true;
            this.trigger('connect');
        });

        this.ioSocket.on('connect_error', (err) => {
            this.trigger('connect_error', err);
        });

        this.ioSocket.onAny((event, ...args) => {
            this.trigger(event, ...args);
            if (event === 'serial_ports_list') {
                this.trigger('serial_ports', ...args);
            }
        });
    }

    private initNativeMode() {
        this.isNativeMode = true;

        const bindings: Array<[string, string]> = [
            ['tauri-log-data', 'log_data'],
            ['tauri-sdb-status', 'sdb_status'],
            ['tauri-sdb-error', 'sdb_error'],
            ['tauri-sdb-remote-result', 'sdb_remote_result'],
            ['tauri-ssh-status', 'ssh_status'],
            ['tauri-ssh-error', 'ssh_error'],
            ['tauri-ssh-auth-request', 'ssh_auth_request'],
            ['tauri-serial-status', 'serial_status'],
            ['tauri-serial-error', 'serial_error'],
        ];

        Promise.all(
            bindings.map(([tauriEvt, socketEvt]) =>
                listen<any>(tauriEvt, (ev) => {
                    this.trigger(socketEvt, ev.payload);
                }).then((un) => {
                    if (this.disposed) {
                        un();
                    } else {
                        this.tauriUnlisteners.push(un);
                    }
                })
            )
        )
            .catch(() => {})
            .finally(() => {
                if (!this.disposed) {
                    this.connected = true;
                    this.trigger('connect');
                }
            });
    }

    private trigger(event: string, ...args: any[]) {
        const set = this.listeners.get(event);
        if (set) {
            set.forEach((cb) => {
                try {
                    cb(...args);
                } catch (e) {
                    console.error(`[HybridTauriSocket] Listener error on ${event}:`, e);
                }
            });
        }
    }

    public on(event: string, callback: EventHandler): this {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        return this;
    }

    public off(event: string, callback?: EventHandler): this {
        if (!callback) {
            this.listeners.delete(event);
        } else {
            this.listeners.get(event)?.delete(callback);
        }
        return this;
    }

    public emit(event: string, payload?: any): this {
        if (!this.isNativeMode) {
            if (this.ioSocket) {
                this.ioSocket.emit(event, payload);
            }
            return this;
        }

        switch (event) {
            case 'list_serial_ports':
                invoke('native_list_serial_ports')
                    .then((ports) => {
                        this.trigger('serial_ports', ports);
                        this.trigger('serial_ports_list', ports);
                    })
                    .catch((err) => {
                        this.trigger('serial_error', { message: String(err) });
                    });
                break;
            case 'connect_serial':
                invoke('serial_connect', {
                    port: payload?.port || payload?.path || '',
                    baudRate: payload?.baudRate ?? 115200,
                    saveToFile: !!payload?.saveToFile,
                    debug: !!payload?.debug,
                }).catch((err) => {
                    this.trigger('serial_error', { message: String(err) });
                });
                break;
            case 'serial_write':
                invoke('serial_write', {
                    data: typeof payload === 'string' ? payload : String(payload ?? ''),
                }).catch(() => {});
                break;
            case 'serial_special_key':
                invoke('serial_special_key', { key: String(payload ?? '') }).catch(() => {});
                break;
            case 'disconnect_serial':
                invoke('serial_disconnect').catch(() => {});
                break;
            case 'list_sdb_devices':
                invoke('native_list_sdb_devices', { sdbPath: payload?.sdbPath })
                    .then((devices) => {
                        this.trigger('sdb_devices', devices);
                    })
                    .catch(() => {
                        this.trigger('sdb_devices', []);
                    });
                break;
            case 'connect_sdb':
                invoke('sdb_connect', {
                    deviceId: payload?.deviceId,
                    debug: !!payload?.debug,
                    saveToFile: !!payload?.saveToFile,
                    sdbPath: payload?.sdbPath,
                }).catch((err) => {
                    this.trigger('sdb_error', { message: String(err) });
                });
                break;
            case 'sdb_write':
                invoke('sdb_write', {
                    data: typeof payload === 'string' ? payload : String(payload ?? ''),
                }).catch(() => {});
                break;
            case 'sdb_clear':
                invoke('sdb_clear').catch(() => {});
                break;
            case 'disconnect_sdb':
                invoke('sdb_disconnect').catch(() => {});
                break;
            case 'connect_sdb_remote':
                invoke('sdb_connect_remote', {
                    ip: payload?.ip ?? '',
                    sdbPath: payload?.sdbPath,
                }).catch((err) => {
                    this.trigger('sdb_remote_result', { success: false, error: String(err) });
                });
                break;
            case 'connect_ssh':
                invoke('ssh_connect', {
                    host: payload?.host ?? '',
                    port: payload?.port ?? 22,
                    username: payload?.username ?? 'root',
                    password: payload?.password ?? '',
                    debug: !!payload?.debug,
                    saveToFile: !!payload?.saveToFile,
                }).catch((err) => {
                    this.trigger('ssh_error', { message: String(err) });
                });
                break;
            case 'ssh_write':
                invoke('ssh_write', {
                    data: typeof payload === 'string' ? payload : String(payload ?? ''),
                }).catch(() => {});
                break;
            case 'ssh_auth_response':
                invoke('ssh_auth_response', {
                    response: typeof payload === 'string' ? payload : String(payload ?? ''),
                }).catch(() => {});
                break;
            case 'ssh_clear':
                invoke('ssh_clear').catch(() => {});
                break;
            case 'disconnect_ssh':
                invoke('ssh_disconnect').catch(() => {});
                break;
            case 'start_scroll_stream':
                invoke('native_start_scroll_stream', { interval: payload?.interval ?? 100 }).catch(
                    () => {}
                );
                break;
            case 'stop_scroll_stream':
                invoke('native_stop_scroll_stream').catch(() => {});
                break;
            default:
                break;
        }
        return this;
    }

    public disconnect(): this {
        this.disposed = true;
        this.connected = false;
        if (this.isNativeMode) {
            invoke('native_stop_scroll_stream').catch(() => {});
        }
        this.tauriUnlisteners.forEach((un) => un());
        this.tauriUnlisteners = [];
        if (this.ioSocket) {
            this.ioSocket.disconnect();
        }
        this.trigger('disconnect');
        return this;
    }
}

export function createLogStreamSocket(url: string = 'http://127.0.0.1:3003'): Socket {
    if (isTauriEnvironment()) {
        return new HybridTauriSocket(url) as unknown as Socket;
    }
    return io(url);
}
