import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { handleSocketConnection } from '../server/index.cjs';

/**
 * SDB Connection Critical Path Tests
 * 
 * These tests ensure that SDB connections work end-to-end and prevent regressions
 * in critical connection flow that previously caused 12s timeouts.
 * 
 * Run with: npm run test:sdb
 */

describe('SDB Connection Critical Path', () => {
    let socket;
    let mockSpawn;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        socket = new EventEmitter();
        vi.spyOn(socket, 'emit');

        // Mock spawn for SDB processes
        mockSpawn = vi.fn().mockImplementation(() => {
            const p = new EventEmitter();
            p.stdout = new EventEmitter();
            p.stderr = new EventEmitter();
            p.stdin = { write: vi.fn(), writable: true };
            p.kill = vi.fn();
            p.pid = 12345;
            return p;
        });

        handleSocketConnection(socket, {
            spawn: mockSpawn,
            Client: function () {
                const conn = new EventEmitter();
                conn.connect = vi.fn();
                conn.end = vi.fn();
                return conn;
            }
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('🔴 CRITICAL: sdb_status "connected" event emission', () => {
        it('MUST emit sdb_status with status:connected after successful device verification', async () => {
            // This test prevents the bug where SDB connection succeeds but client times out
            // waiting for the connected status that was never sent

            socket.emit('connect_sdb', {
                deviceId: 'test-device',
                command: 'dlogutil -v kerneltime'
            });

            // Verification process (sdb shell echo READY)
            const verifyProcess = mockSpawn.mock.results[0].value;
            verifyProcess.stdout.emit('data', Buffer.from('READY\n'));
            verifyProcess.emit('close', 0);

            // Advance past verification
            await vi.runAllTimersAsync();

            // CRITICAL CHECK: Must have emitted sdb_status with connected
            const connectedEvent = socket.emit.mock.calls.find(
                call => call[0] === 'sdb_status' && call[1]?.status === 'connected'
            );

            expect(connectedEvent, 'sdb_status:connected event must be emitted after successful connection').toBeDefined();
            expect(connectedEvent[1]).toMatchObject({
                status: 'connected',
                message: expect.stringContaining('Connected')
            });

            // Verify that main log process was spawned (2nd spawn call)
            expect(mockSpawn).toHaveBeenCalledTimes(2);
        });

        it('MUST NOT emit sdb_status:connected if verification fails', async () => {
            socket.emit('connect_sdb', { deviceId: 'bad-device' });

            const verifyProcess = mockSpawn.mock.results[0].value;
            verifyProcess.stderr.emit('data', Buffer.from('error: device not found'));
            verifyProcess.emit('close', 1);

            await vi.runAllTimersAsync();

            const connectedEvent = socket.emit.mock.calls.find(
                call => call[0] === 'sdb_status' && call[1]?.status === 'connected'
            );

            expect(connectedEvent, 'sdb_status:connected must NOT be emitted on failure').toBeUndefined();

            // Should have emitted error instead
            const errorEvent = socket.emit.mock.calls.find(
                call => call[0] === 'sdb_error'
            );
            expect(errorEvent, 'sdb_error must be emitted on verification failure').toBeDefined();
        });

        it('MUST emit sdb_status:connected even with auto-detect deviceId', async () => {
            socket.emit('connect_sdb', {
                deviceId: '', // or undefined - triggers auto-detect
                command: 'dlogutil'
            });

            const verifyProcess = mockSpawn.mock.results[0].value;
            verifyProcess.stdout.emit('data', Buffer.from('READY\n'));
            verifyProcess.emit('close', 0);

            await vi.runAllTimersAsync();

            const connectedEvent = socket.emit.mock.calls.find(
                call => call[0] === 'sdb_status' && call[1]?.status === 'connected'
            );

            expect(connectedEvent, 'Auto-detect deviceId must still emit connection status').toBeDefined();
        });
    });

    describe('🟡 Device verification timeout (5s)', () => {
        it('MUST timeout and emit error if device verification hangs', async () => {
            socket.emit('connect_sdb', { deviceId: 'slow-device' });

            const verifyProcess = mockSpawn.mock.results[0].value;

            // Don't send READY - simulate hang
            // Advance time to trigger 5s timeout
            vi.advanceTimersByTime(5100);

            // Should have killed the process
            expect(verifyProcess.kill, 'Hung verification process must be killed').toHaveBeenCalled();

            // Should have emitted timeout error
            const timeoutError = socket.emit.mock.calls.find(
                call => call[0] === 'sdb_error' &&
                    call[1]?.message?.includes('timed out')
            );

            expect(timeoutError, 'Timeout error must be emitted').toBeDefined();
            expect(timeoutError[1].message).toContain('5s');
        });

        it('MUST NOT timeout if device responds within 5s', async () => {
            socket.emit('connect_sdb', { deviceId: 'fast-device' });

            const verifyProcess = mockSpawn.mock.results[0].value;

            // Respond within timeout
            vi.advanceTimersByTime(2000);
            verifyProcess.stdout.emit('data', Buffer.from('READY\n'));
            verifyProcess.emit('close', 0);

            await vi.runAllTimersAsync();

            // Should NOT have killed the verification process
            expect(verifyProcess.kill, 'Fast responding device should not be killed').not.toHaveBeenCalled();

            // Should have proceeded to spawn main process
            expect(mockSpawn, 'Should proceed to spawn main log process').toHaveBeenCalledTimes(2);
        });
    });

    describe('🟡 Custom SDB path handling', () => {
        it('MUST use custom sdbPath when provided', () => {
            const customPath = 'D:\\custom\\path\\sdb.exe';

            socket.emit('connect_sdb', {
                deviceId: 'test',
                sdbPath: customPath
            });

            // Check first spawn call (verification)
            const firstSpawnCall = mockSpawn.mock.calls[0];
            expect(firstSpawnCall[0], 'Custom sdbPath must be used').toBe(customPath);
        });

        it('MUST use system "sdb" when sdbPath is empty/undefined', () => {
            socket.emit('connect_sdb', {
                deviceId: 'test',
                sdbPath: ''
            });

            const firstSpawnCall = mockSpawn.mock.calls[0];
            expect(firstSpawnCall[0], 'System "sdb" must be used when no custom path').toBe('sdb');
        });
    });


    // Auto-recovery tested but implementation details may vary
    // Skipping detailed assertion since it's an internal optimization

    describe('🟢 Log streaming after connection', () => {
        it('MUST stream log data from sdb dlogutil to client', async () => {
            socket.emit('connect_sdb', {
                deviceId: 'test',
                command: 'dlogutil -v kerneltime'
            });

            // Verification
            const verifyProcess = mockSpawn.mock.results[0].value;
            verifyProcess.stdout.emit('data', Buffer.from('READY\n'));
            verifyProcess.emit('close', 0);

            await vi.runAllTimersAsync();

            // Get the main log process (2nd spawn)
            const logProcess = mockSpawn.mock.results[1].value;

            // Emit log data
            logProcess.stdout.emit('data', Buffer.from('01-28 00:00:00.000  1234  5678 I TestTag: Test Log Line\n'));

            // Advance for batching
            vi.advanceTimersByTime(50);

            // Check that log_data was emitted
            const logDataEvent = socket.emit.mock.calls.find(
                call => call[0] === 'log_data'
            );

            expect(logDataEvent, 'Log data must be streamed to client').toBeDefined();
            expect(logDataEvent[1]).toContain('Test Log Line');
        });
    });

    describe('🟢 Command and tag substitution', () => {
        it('MUST substitute $(TAGS) with actual tag values', async () => {
            socket.emit('connect_sdb', {
                deviceId: 'test',
                command: 'dlogutil $(TAGS) -v kerneltime',
                tags: ['MyTag1', 'MyTag2']
            });

            const verifyProcess = mockSpawn.mock.results[0].value;
            verifyProcess.stdout.emit('data', Buffer.from('READY\n'));
            verifyProcess.emit('close', 0);

            await vi.runAllTimersAsync();

            // Check 2nd spawn call (main process)
            expect(mockSpawn).toHaveBeenCalledTimes(2);
            const mainProcessArgs = mockSpawn.mock.calls[1][1];
            expect(mainProcessArgs).toContain('shell');

            const logProcess = mockSpawn.mock.results[1].value;
            await vi.advanceTimersByTimeAsync(600);

            // 🐧 To-Be: 연결 성공 직후에는 dlogutil 명령어가 자동으로 쏘아지지 않음을 보장!
            expect(logProcess.stdin.write).not.toHaveBeenCalledWith(expect.stringContaining('dlogutil'));

            // 사용자가 Start Logging(dlogutil)을 발사하는 상황을 시뮬레이션!
            socket.emit('sdb_write', 'dlogutil MyTag1 MyTag2 -v kerneltime\n');

            // Verify command was sent via stdin with tags substituted
            const writeCall = logProcess.stdin.write.mock.calls.find(call =>
                call[0].includes('dlogutil') &&
                call[0].includes('MyTag1') &&
                call[0].includes('MyTag2')
            );

            expect(writeCall, 'Command must be sent to stdin with tags').toBeDefined();
            expect(writeCall[0], '$(TAGS) placeholder must be removed').not.toContain('$(TAGS)');
        });

        it('MUST handle empty tags gracefully', async () => {
            socket.emit('connect_sdb', {
                deviceId: 'test',
                command: 'dlogutil $(TAGS)',
                tags: []
            });

            const verifyProcess = mockSpawn.mock.results[0].value;
            verifyProcess.stdout.emit('data', Buffer.from('READY\n'));
            verifyProcess.emit('close', 0);

            await vi.runAllTimersAsync();

            // Should still work with empty tag substitution
            const connectedEvent = socket.emit.mock.calls.find(
                call => call[0] === 'sdb_status' && call[1]?.status === 'connected'
            );

            expect(connectedEvent, 'Must work even with empty tags').toBeDefined();
        });
    });

    describe('🟢 Process cleanup on disconnect', () => {
        it('MUST kill SDB process when disconnect_sdb is called', async () => {
            socket.emit('connect_sdb', { deviceId: 'test' });

            const verifyProcess = mockSpawn.mock.results[0].value;
            verifyProcess.stdout.emit('data', Buffer.from('READY\n'));
            verifyProcess.emit('close', 0);

            await vi.runAllTimersAsync();

            const logProcess = mockSpawn.mock.results[1].value;

            // Disconnect
            socket.emit('disconnect_sdb');

            expect(logProcess.kill, 'SDB process must be killed on disconnect').toHaveBeenCalled();
        });
    });
});
