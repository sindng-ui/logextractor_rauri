const { SerialPort } = require('serialport');

class SerialService {
    constructor() {
        this.connections = new Map();
    }

    async listPorts() {
        try {
            return await SerialPort.list();
        } catch (err) {
            console.error('[SerialService] Error listing ports:', err);
            throw err;
        }
    }

    connect(socketId, options, callbacks) {
        const { path, baudRate = 115200, dataBits = 8, stopBits = 1, parity = 'none' } = options;

        if (this.connections.has(socketId)) {
            this.disconnect(socketId);
        }

        console.log(`[SerialService] Connecting to ${path} at ${baudRate} baud for socket ${socketId}`);

        try {
            const port = new SerialPort({
                path,
                baudRate: parseInt(baudRate, 10),
                dataBits: parseInt(dataBits, 10),
                stopBits: parseInt(stopBits, 10),
                parity,
                autoOpen: false
            });

            port.open((err) => {
                if (err) {
                    console.error(`[SerialService] Error opening port ${path}:`, err.message);
                    if (callbacks.onError) callbacks.onError(err);
                    return;
                }

                console.log(`[SerialService] Port ${path} opened successfully`);
                this.connections.set(socketId, port);
                if (callbacks.onOpen) callbacks.onOpen();
            });

            port.on('data', (data) => {
                if (callbacks.onData) callbacks.onData(data);
            });

            port.on('error', (err) => {
                console.error(`[SerialService] Port ${path} error:`, err.message);
                if (callbacks.onError) callbacks.onError(err);
            });

            port.on('close', () => {
                console.log(`[SerialService] Port ${path} closed`);
                this.connections.delete(socketId);
                if (callbacks.onClose) callbacks.onClose();
            });

        } catch (err) {
            console.error(`[SerialService] Exception during connect:`, err.message);
            if (callbacks.onError) callbacks.onError(err);
        }
    }

    write(socketId, data) {
        const port = this.connections.get(socketId);
        if (port && port.isOpen) {
            port.write(data, (err) => {
                if (err) {
                    console.error(`[SerialService] Write error on socket ${socketId}:`, err.message);
                }
            });
        }
    }

    sendSpecialSignal(socketId, signal) {
        const port = this.connections.get(socketId);
        if (!port || !port.isOpen) return;

        switch (signal) {
            case 'break':
                console.log(`[SerialService] Sending BREAK signal on socket ${socketId}`);
                port.set({ brk: true }, (err) => {
                    if (err) console.error('[SerialService] Failed to set BRK:', err);
                    setTimeout(() => {
                        port.set({ brk: false }, (err2) => {
                            if (err2) console.error('[SerialService] Failed to clear BRK:', err2);
                        });
                    }, 200);
                });
                break;
            case 'ctrl+c':
                this.write(socketId, Buffer.from([0x03]));
                break;
            case 'ctrl+z':
                this.write(socketId, Buffer.from([0x1A]));
                break;
            case 'ctrl+d':
                this.write(socketId, Buffer.from([0x04]));
                break;
            default:
                console.warn(`[SerialService] Unknown special signal: ${signal}`);
        }
    }

    disconnect(socketId) {
        const port = this.connections.get(socketId);
        if (port) {
            if (port.isOpen) {
                port.close((err) => {
                    if (err) {
                        console.error(`[SerialService] Error closing port for socket ${socketId}:`, err.message);
                    }
                });
            }
            this.connections.delete(socketId);
        }
    }
}

module.exports = new SerialService();
