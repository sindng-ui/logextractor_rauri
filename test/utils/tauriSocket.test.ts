import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const listenMock = vi.fn();
const listenersByTauriEvent = new Map<string, (ev: { payload: any }) => void>();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: (evtName: string, cb: (ev: { payload: any }) => void) => {
        listenMock(evtName, cb);
        listenersByTauriEvent.set(evtName, cb);
        return Promise.resolve(() => {
            listenersByTauriEvent.delete(evtName);
        });
    },
}));

const ioMock = vi.fn();
vi.mock('socket.io-client', () => ({
    io: (...args: any[]) => ioMock(...args),
}));

import { createLogStreamSocket } from '../../utils/tauriSocket';

describe('HybridTauriSocket (Tauri Native Stream Bridge)', () => {
    beforeEach(() => {
        (window as any).__TAURI_INTERNALS__ = {};
        invokeMock.mockReset().mockResolvedValue([]);
        listenMock.mockClear();
        listenersByTauriEvent.clear();
        ioMock.mockReset();
    });

    afterEach(() => {
        delete (window as any).__TAURI_INTERNALS__;
    });

    it('connects natively without touching port 3003 Socket.IO client in Tauri runtime', async () => {
        const sock = createLogStreamSocket('http://127.0.0.1:3003');
        const onConnect = vi.fn();
        sock.on('connect', onConnect);

        await new Promise((r) => setTimeout(r, 0));

        expect(ioMock).not.toHaveBeenCalled();
        expect(onConnect).toHaveBeenCalledTimes(1);
        sock.disconnect();
    });

    it('routes SDB, SSH, and Serial emit calls directly to native Rust commands', async () => {
        const sock = createLogStreamSocket('http://127.0.0.1:3003');
        await Promise.resolve();

        invokeMock.mockResolvedValueOnce([{ id: '192.168.1.10:26101', type: 'device' }]);
        const devicesSpy = vi.fn();
        sock.on('sdb_devices', devicesSpy);

        sock.emit('list_sdb_devices', { sdbPath: 'C:\\tools\\sdb.exe' });
        await Promise.resolve();
        expect(invokeMock).toHaveBeenCalledWith('native_list_sdb_devices', {
            sdbPath: 'C:\\tools\\sdb.exe',
        });
        expect(devicesSpy).toHaveBeenCalledWith([{ id: '192.168.1.10:26101', type: 'device' }]);

        sock.emit('connect_sdb', { deviceId: '192.168.1.10:26101', debug: true, saveToFile: true, sdbPath: 'C:\\tools\\sdb.exe' });
        expect(invokeMock).toHaveBeenCalledWith('sdb_connect', {
            deviceId: '192.168.1.10:26101',
            debug: true,
            saveToFile: true,
            sdbPath: 'C:\\tools\\sdb.exe',
        });

        sock.emit('sdb_write', 'dlogutil\n');
        expect(invokeMock).toHaveBeenCalledWith('sdb_write', { data: 'dlogutil\n' });
        sock.emit('sdb_clear');
        expect(invokeMock).toHaveBeenCalledWith('sdb_clear');
        sock.emit('disconnect_sdb');
        expect(invokeMock).toHaveBeenCalledWith('sdb_disconnect');

        sock.emit('connect_ssh', { host: '10.0.0.5', port: 22, username: 'root', password: 'pw', debug: false, saveToFile: true });
        expect(invokeMock).toHaveBeenCalledWith('ssh_connect', {
            host: '10.0.0.5',
            port: 22,
            username: 'root',
            password: 'pw',
            debug: false,
            saveToFile: true,
        });
        sock.emit('ssh_auth_response', 'secret');
        expect(invokeMock).toHaveBeenCalledWith('ssh_auth_response', { response: 'secret' });

        sock.emit('connect_serial', { port: 'COM3', baudRate: 115200, saveToFile: false, debug: false });
        expect(invokeMock).toHaveBeenCalledWith('serial_connect', {
            port: 'COM3',
            baudRate: 115200,
            saveToFile: false,
            debug: false,
        });
        sock.emit('serial_special_key', 'ctrl_p_thrice');
        expect(invokeMock).toHaveBeenCalledWith('serial_special_key', { key: 'ctrl_p_thrice' });

        // Forwarded Tauri events arrive on socket listeners
        const logSpy = vi.fn();
        const sdbStatusSpy = vi.fn();
        sock.on('log_data', logSpy);
        sock.on('sdb_status', sdbStatusSpy);

        listenersByTauriEvent.get('tauri-log-data')?.({ payload: 'sample line\n' });
        listenersByTauriEvent.get('tauri-sdb-status')?.({ payload: { status: 'connected', message: 'ok' } });

        expect(logSpy).toHaveBeenCalledWith('sample line\n');
        expect(sdbStatusSpy).toHaveBeenCalledWith({ status: 'connected', message: 'ok' });

        sock.disconnect();
    });
});
