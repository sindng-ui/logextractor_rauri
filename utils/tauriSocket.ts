import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { io, Socket } from 'socket.io-client';
import { isTauriEnvironment } from './tauriBridge';

type EventHandler = (...args: any[]) => void;

/**
 * Fallback/Native Socket Adapter that mirrors `socket.io-client` API
 * using Tauri IPC & Events if the local port 3003 Socket.IO server is unavailable,
 * while seamlessly delegating to `socket.io-client` when port 3003 is active.
 */
export class HybridTauriSocket {
    public id: string = `tauri-sock-${Math.random().toString(36).slice(2, 8)}`;
    public connected: boolean = false;
    private ioSocket: Socket | null = null;
    private listeners: Map<string, Set<EventHandler>> = new Map();
    private tauriUnlisteners: UnlistenFn[] = [];
    private useNativeFallback: boolean = false;

    constructor(url: string = 'http://127.0.0.1:3003') {
        this.ioSocket = io(url, {
            reconnectionAttempts: 2,
            timeout: 2500,
        });

        this.ioSocket.on('connect', () => {
            this.connected = true;
            this.useNativeFallback = false;
            this.trigger('connect');
        });

        this.ioSocket.on('connect_error', () => {
            if (!this.connected && isTauriEnvironment() && !this.useNativeFallback) {
                this.activateNativeFallback();
            }
        });

        this.ioSocket.onAny((event, ...args) => {
            this.trigger(event, ...args);
            // Compatibility bridge: server emits serial_ports_list, UI listens for serial_ports
            if (event === 'serial_ports_list') {
                this.trigger('serial_ports', ...args);
            }
        });
    }

    private activateNativeFallback() {
        this.useNativeFallback = true;
        this.connected = true;

        if (isTauriEnvironment()) {
            listen<string>('tauri-log-data', (ev) => {
                this.trigger('log_data', ev.payload);
            })
                .then((un) => this.tauriUnlisteners.push(un))
                .catch(() => {});
        }

        setTimeout(() => {
            this.trigger('connect');
        }, 10);
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
        if (!this.useNativeFallback && this.ioSocket?.connected) {
            this.ioSocket.emit(event, payload);
            return this;
        }

        // Native Rust fallback handlers
        if (isTauriEnvironment()) {
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
                case 'list_sdb_devices':
                    invoke('native_list_sdb_devices', { sdbPath: payload?.sdbPath })
                        .then((devices) => {
                            this.trigger('sdb_devices', devices);
                        })
                        .catch(() => {
                            this.trigger('sdb_devices', []);
                        });
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
                    if (this.ioSocket) {
                        this.ioSocket.emit(event, payload);
                    }
                    break;
            }
        }
        return this;
    }

    public disconnect(): this {
        this.connected = false;
        if (this.useNativeFallback && isTauriEnvironment()) {
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
