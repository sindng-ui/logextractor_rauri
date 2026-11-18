import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEmit = vi.fn();
const mockDisconnect = vi.fn();
const listeners = new Map<string, Array<(data: any) => void>>();

const fakeSocket = {
    on: (evt: string, cb: (data: any) => void) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt)!.push(cb);
        return fakeSocket;
    },
    off: vi.fn(),
    emit: (...args: any[]) => mockEmit(...args),
    disconnect: () => mockDisconnect(),
};

vi.mock('../../utils/tauriSocket', () => ({
    createLogStreamSocket: () => fakeSocket,
}));

import TizenConnectionModal from '../../components/TizenConnectionModal';

describe('TizenConnectionModal', () => {
    beforeEach(() => {
        localStorage.clear();
        mockEmit.mockReset();
        mockDisconnect.mockReset();
        listeners.clear();
    });

    it('passes custom sdbPath when clicking Rescan and emits connect_sdb on connect', () => {
        const onStreamStart = vi.fn();
        const onClose = vi.fn();

        render(
            <TizenConnectionModal
                isOpen={true}
                onClose={onClose}
                onStreamStart={onStreamStart}
            />
        );

        // Find SDB PATH text input and type custom path
        const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
        // SDB Path input is in SDB mode (default mode)
        const sdbPathInput = Array.from(inputs).find(
            el => (el as HTMLInputElement).placeholder !== '115200'
        ) as HTMLInputElement;
        expect(sdbPathInput).toBeTruthy();

        fireEvent.change(sdbPathInput, { target: { value: 'D:\\tizen\\sdb.exe' } });
        fireEvent.click(screen.getByText(/Rescan/i));

        expect(mockEmit).toHaveBeenCalledWith('list_sdb_devices', { sdbPath: 'D:\\tizen\\sdb.exe' });

        fireEvent.click(screen.getByText('CONNECT & START STREAM'));
        expect(mockEmit).toHaveBeenCalledWith('connect_sdb', expect.objectContaining({
            sdbPath: 'D:\\tizen\\sdb.exe',
        }));
    });
});
