const path = require('path');
const fs = require('fs');
const { StringDecoder } = require('string_decoder');

console.log('[TIME] server/index.cjs loaded (Lightweight Mode)');

let http, Server, Client, spawn, exec, serialService;
let server, io;

const getSdbBin = (sdbPath) => {
    const p = (sdbPath || '').trim();
    return p.length > 0 ? p : 'sdb';
};

/**
 * Modular Socket Connection Handler for Log Extractor (SDB, SSH, Serial, Test Simulator)
 */
const handleSocketConnection = (socket, deps = {}) => {
    const activeSpawn = deps.spawn || spawn || require('child_process').spawn;
    const ActiveSSHClient = deps.Client || Client || require('ssh2').Client;
    const activeExec = deps.exec || exec || require('child_process').exec;
    const activeSerial = deps.serialService || serialService || require('./services/serialService.cjs');

    const safeSpawn = (bin, args = [], options = {}, debugTag = 'SDB') => {
        const finalOptions = { windowsHide: true, ...options };
        const fullCommandStr = `${bin} ${args.join(' ')}`;
        console.log(`[SPAWN_AUDIT] [${debugTag}] Running: "${fullCommandStr}"`);
        return activeSpawn(bin, args, finalOptions);
    };

    console.log('Frontend connected:', socket.id);

    let sshClient = null;
    let sshStream = null;
    let sdbProcess = null;
    let isIntentionalSdbDisconnect = false;
    let isIntentionalSshDisconnect = false;
    let isIntentionalSerialDisconnect = false;

    // --- High-Performance Log Batching ---
    let logBuffer = [];
    let flushTimer = null;
    const BATCH_INTERVAL = 20;
    const decoder = new StringDecoder('utf8');
    let ignoreLogs = false;

    const flushLogs = () => {
        if (logBuffer.length > 0) {
            const fullChunk = logBuffer.join('');
            logBuffer = [];
            socket.emit('log_data', fullChunk);
        }
        flushTimer = null;
    };

    const handleLogData = (rawChunk) => {
        if (ignoreLogs) return;
        const text = decoder.write(rawChunk);
        if (!text) return;
        logBuffer.push(text);
        if (!flushTimer) {
            flushTimer = setTimeout(flushLogs, BATCH_INTERVAL);
        }
    };

    // --- Serial Port Handlers ---
    socket.on('list_serial_ports', async () => {
        try {
            const ports = await activeSerial.listPorts();
            socket.emit('serial_ports_list', ports);
            socket.emit('serial_ports', ports);
        } catch (err) {
            socket.emit('serial_error', { message: `Failed to list serial ports: ${err.message}` });
        }
    });

    socket.on('connect_serial', (options) => {
        const targetPath = options.path || options.port;
        const normalizedOptions = { ...options, path: targetPath };
        console.log(`[Serial] Connection request from ${socket.id} to ${targetPath}`);
        isIntentionalSerialDisconnect = false;
        ignoreLogs = false;

        activeSerial.connect(socket.id, normalizedOptions, {
            onOpen: () => {
                socket.emit('serial_status', { status: 'connected', message: `Connected to ${targetPath} (${options.baudRate})` });
            },
            onData: (data) => {
                handleLogData(data);
            },
            onError: (err) => {
                socket.emit('serial_error', { message: err.message });
            },
            onClose: () => {
                flushLogs();
                if (!isIntentionalSerialDisconnect) {
                    socket.emit('serial_error', { message: `Serial port ${targetPath} disconnected unexpectedly.` });
                }
                socket.emit('serial_status', { status: 'disconnected', message: `Disconnected from ${targetPath}` });
            }
        });
    });

    socket.on('serial_write', (data) => {
        activeSerial.write(socket.id, data);
    });

    socket.on('serial_special_key', (signal) => {
        activeSerial.sendSpecialSignal(socket.id, signal);
    });

    socket.on('disconnect_serial', () => {
        console.log(`[Serial] Manual disconnect from ${socket.id}`);
        isIntentionalSerialDisconnect = true;
        activeSerial.disconnect(socket.id);
    });

    // --- SSH Handlers ---
    let pendingAuthCallback = null;

    socket.on('connect_ssh', ({ host, port, username, password, debug, command, tags }) => {
        console.log(`Initiating SSH connection to ${username}@${host}:${port}`);

        if (sshClient) {
            isIntentionalSshDisconnect = true;
            sshClient.end();
        }
        isIntentionalSshDisconnect = false;
        ignoreLogs = false;

        try {
            sshClient = new ActiveSSHClient();

            sshClient.on('banner', (message) => {
                handleLogData(Buffer.from(`\r\n*** SSH Banner ***\r\n${message}\r\n`));
            });

            sshClient.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
                console.log('Keyboard-interactive auth requested.');
                if (prompts.length > 0 && password) {
                    finish([password]);
                } else {
                    pendingAuthCallback = finish;
                    socket.emit('ssh_auth_request', {
                        prompt: prompts[0]?.prompt || 'Password: ',
                        echo: prompts[0]?.echo || false
                    });
                }
            });

            sshClient.on('ready', () => {
                console.log('SSH Connection Ready!');
                socket.emit('ssh_status', { status: 'connected', message: `Connected to ${host}` });

                sshClient.shell((err, stream) => {
                    if (err) {
                        socket.emit('ssh_error', { message: 'Failed to open shell: ' + err.message });
                        return;
                    }

                    sshStream = stream;

                    stream.on('data', (data) => {
                        handleLogData(data);
                    });

                    stream.on('close', () => {
                        console.log('SSH Stream closed');
                        flushLogs();
                        sshClient.end();
                        socket.emit('ssh_status', { status: 'disconnected', message: 'Stream closed' });
                    });

                    stream.stderr.on('data', (data) => {
                        handleLogData(data);
                    });

                    setTimeout(() => {
                        if (stream.writable) {
                            console.log(`[SSH] Shell stream ready for user commands on ${host}`);
                        }
                    }, 500);
                });

            }).on('error', (err) => {
                console.error('SSH Connection Error:', err);
                flushLogs();

                let detailedMsg = `Connection Failed: ${err.message}`;
                if (err.level === 'client-authentication') {
                    detailedMsg = 'Authentication Failed! Please check your username and password.';
                } else if (err.code === 'ECONNREFUSED') {
                    detailedMsg = `Connection Refused! Is SSH running on ${host}:${port || 22}?`;
                } else if (err.code === 'ETIMEDOUT') {
                    detailedMsg = `Connection Timed Out! Host ${host} is unreachable.`;
                } else if (err.code === 'ENOTFOUND') {
                    detailedMsg = `Host Not Found! Check the IP/Hostname: ${host}`;
                }

                socket.emit('ssh_error', {
                    message: detailedMsg,
                    code: err.code,
                    level: err.level
                });
            }).on('end', () => {
                console.log('SSH Connection ended');
                flushLogs();
                socket.emit('ssh_status', { status: 'disconnected', message: 'Connection ended' });
            }).on('close', (hadError) => {
                console.log('SSH Connection closed', hadError ? 'with error' : 'cleanly');
                flushLogs();
                if (!isIntentionalSshDisconnect) {
                    socket.emit('ssh_error', { message: 'SSH Connection lost unexpectedly.' });
                }
                socket.emit('ssh_status', { status: 'disconnected', message: 'Connection closed' });
            });

            sshClient.connect({
                host,
                port: parseInt(port) || 22,
                username,
                password,
                tryKeyboard: true,
                readyTimeout: 20000,
                keepaliveInterval: 10000,
                debug: debug ? (info) => console.log(`[SSH-DEBUG] ${info}`) : undefined
            });
        } catch (err) {
            socket.emit('ssh_error', { message: 'Failed to create SSH client: ' + err.message });
        }
    });

    socket.on('ssh_auth_response', (response) => {
        if (pendingAuthCallback) {
            pendingAuthCallback([response]);
            pendingAuthCallback = null;
        }
    });

    socket.on('ssh_write', (data) => {
        ignoreLogs = false;
        if (sshStream && sshStream.writable) {
            sshStream.write(data);
        }
    });

    socket.on('ssh_clear', () => {
        console.log('[SSH] Clear requested (Soft Clear). Ignoring incoming logs until next command...');
        ignoreLogs = true;
        logBuffer = [];
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    });

    socket.on('disconnect_ssh', () => {
        isIntentionalSshDisconnect = true;
        if (sshClient) {
            sshClient.end();
            sshClient = null;
            sshStream = null;
        }
    });

    // --- SDB Handlers ---
    socket.on('connect_sdb', ({ deviceId, debug, command, tags, sdbPath }) => {
        console.log(`Initiating SDB connection for device: ${deviceId || 'auto-detect'} using ${sdbPath || 'system sdb'}`);

        if (sdbProcess) {
            isIntentionalSdbDisconnect = true;
            sdbProcess.kill();
            sdbProcess = null;
        }
        isIntentionalSdbDisconnect = false;
        ignoreLogs = false;

        let targetArgs = [];
        if (deviceId && deviceId.trim() !== '' && deviceId !== 'auto-detect') {
            targetArgs = ['-s', deviceId.trim()];
        }

        const checkArgs = [...targetArgs, 'shell', 'echo', 'READY'];
        let hasretried = false;

        const runCheck = () => {
            console.log(`Verifying SDB connection: ${getSdbBin(sdbPath)} ${checkArgs.join(' ')}`);

            const checkProcess = safeSpawn(getSdbBin(sdbPath), checkArgs, {}, '[SDB Connect/Check]');
            let checkOutput = '';
            let checkError = '';
            let checkCompleted = false;

            const checkTimeout = setTimeout(() => {
                if (!checkCompleted) {
                    checkCompleted = true;
                    console.error('[SDB Check] Timeout after 5s! Killing check process...');
                    checkProcess.kill();
                    socket.emit('sdb_error', {
                        message: `Device verification timed out (5s). Is the device connected and responsive?`,
                        code: 'TIMEOUT'
                    });
                }
            }, 5000);

            checkProcess.stdout.on('data', (d) => checkOutput += d.toString());
            checkProcess.stderr.on('data', (d) => checkError += d.toString());

            checkProcess.on('close', (code) => {
                if (checkCompleted) return;
                checkCompleted = true;
                clearTimeout(checkTimeout);

                if (code !== 0 || !checkOutput.includes('READY')) {
                    const errStr = (checkError || checkOutput).trim();
                    console.error(`SDB Check Failed (Code ${code}): ${errStr}`);

                    if (!hasretried && (errStr.includes('target not found') || errStr.includes('error: target not found'))) {
                        const isIp = deviceId && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(deviceId.trim());
                        const targetToRecover = isIp ? deviceId.trim() : '192.168.250.250';

                        hasretried = true;
                        console.log(`[SDB Auto-Recovery] Target (${deviceId || 'auto'}) not found. Attempting to reconnect to ${targetToRecover}...`);

                        socket.emit('sdb_status', { status: 'connecting', message: `Target lost. Reconnecting to ${targetToRecover}...` });

                        const disProc = safeSpawn(getSdbBin(sdbPath), ['disconnect', targetToRecover], {}, '[SDB Recov/Dis]');
                        disProc.on('close', () => {
                            const conProc = safeSpawn(getSdbBin(sdbPath), ['connect', targetToRecover], {}, '[SDB Recov/Con]');
                            let conOut = '';
                            conProc.stdout.on('data', d => conOut += d.toString());
                            conProc.stderr.on('data', d => conOut += d.toString());

                            conProc.on('close', (conCode) => {
                                console.log(`[SDB Auto-Recovery] Reconnect result (${conCode}): ${conOut.trim()}`);
                                if (conOut.includes('connected to') || conOut.includes('already connected')) {
                                    const rootProc = safeSpawn(getSdbBin(sdbPath), ['-s', targetToRecover, 'root', 'on'], {}, '[SDB Recov/Root]');
                                    let rootOut = '';
                                    rootProc.stdout.on('data', d => rootOut += d.toString());
                                    rootProc.on('close', () => {
                                        console.log(`[SDB Auto-Recovery] Root on result: ${rootOut.trim()}`);
                                        setTimeout(runCheck, 500);
                                    });
                                    rootProc.on('error', () => setTimeout(runCheck, 500));
                                } else {
                                    let failMsg = `SDB Auto-Recovery Failed for ${targetToRecover}.\nOutput: ${conOut.trim()}`;
                                    socket.emit('sdb_error', { message: failMsg, code: conCode });
                                }
                            });
                        });
                        return;
                    }

                    const errMsg = errStr || `Device verification failed (Code ${code})`;
                    socket.emit('sdb_error', { message: `Connection Failed: ${errMsg}`, code });
                    return;
                }

                console.log('SDB Check Passed! Device is ready.');

                const sdbArgs = [...targetArgs, 'shell'];
                console.log(`Spawning SDB session: ${getSdbBin(sdbPath)} ${sdbArgs.join(' ')}`);

                try {
                    sdbProcess = safeSpawn(getSdbBin(sdbPath), sdbArgs, {}, '[SDB Connect/Main]');

                    socket.emit('sdb_status', {
                        status: 'connected',
                        message: `Connected to SDB (${deviceId || 'Auto'})`
                    });

                    setTimeout(() => {
                        if (sdbProcess && sdbProcess.stdin.writable) {
                            console.log(`[SDB] Shell stream ready for user commands on ${deviceId || 'Auto'}`);
                        }
                    }, 500);

                    sdbProcess.stdout.on('data', (data) => {
                        handleLogData(data);
                    });

                    sdbProcess.stderr.on('data', (data) => {
                        const errText = data.toString();
                        console.error(`[SDB STDERR]: ${errText}`);
                        handleLogData(data);
                    });

                    sdbProcess.on('close', (closeCode) => {
                        console.log(`SDB process exited with code ${closeCode}`);
                        flushLogs();
                        if (!isIntentionalSdbDisconnect) {
                            socket.emit('sdb_error', {
                                message: `SDB session ended unexpectedly (Exit Code ${closeCode}). Device might have been disconnected.`
                            });
                        }
                        socket.emit('sdb_status', {
                            status: 'disconnected',
                            message: `SDB process exited (code ${closeCode})`
                        });
                        sdbProcess = null;
                    });

                    sdbProcess.on('error', (err) => {
                        console.error('Failed to start SDB process:', err);
                        flushLogs();
                        socket.emit('sdb_error', { message: 'Failed to launch SDB: ' + err.message });
                        sdbProcess = null;
                    });

                } catch (err) {
                    socket.emit('sdb_error', { message: 'Exception spawning SDB: ' + err.message });
                }
            });

            checkProcess.on('error', (err) => {
                console.error('SDB Check Spawn Error:', err);
                let msg = `Failed to run '${getSdbBin(sdbPath)}'.`;
                if (err.code === 'ENOENT') {
                    msg = `SDB Executable Not Found! Cannot find '${getSdbBin(sdbPath)}'. Please check the SDB Path or your system PATH.`;
                } else {
                    msg += ` Error: ${err.message}`;
                }
                socket.emit('sdb_error', { message: msg, code: err.code });
            });
        };

        runCheck();
    });

    socket.on('sdb_write', (data) => {
        ignoreLogs = false;
        if (sdbProcess && sdbProcess.stdin && sdbProcess.stdin.writable) {
            sdbProcess.stdin.write(data);
        }
    });

    socket.on('sdb_clear', () => {
        console.log('[SDB] Clear requested (Soft Clear). Ignoring incoming logs until next command...');
        ignoreLogs = true;
        logBuffer = [];
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    });

    socket.on('disconnect_sdb', () => {
        isIntentionalSdbDisconnect = true;
        if (sdbProcess) {
            sdbProcess.kill();
            sdbProcess = null;
            console.log('SDB process killed by user');
            socket.emit('sdb_status', { status: 'disconnected', message: 'Disconnected by user' });
        }
    });

    // --- Test Stream Simulator ---
    let scrollStreamInterval = null;
    let lineCounter = 0;

    socket.on('start_scroll_stream', ({ interval = 100 } = {}) => {
        console.log(`[Test] Starting scroll stream with interval ${interval}ms`);
        if (scrollStreamInterval) clearInterval(scrollStreamInterval);
        lineCounter = 0;

        scrollStreamInterval = setInterval(() => {
            const now = new Date();
            const timestamp = now.toISOString();
            const logLevels = ['INFO', 'DEBUG', 'WARN', 'ERROR'];
            const level = logLevels[lineCounter % logLevels.length];
            const logLine = `${timestamp} [${level}] [TestScroll] Automated log line #${++lineCounter} - Verify smooth scrolling and tailing behavior.\n`;
            handleLogData(Buffer.from(logLine));
        }, interval);
    });

    socket.on('stop_scroll_stream', () => {
        if (scrollStreamInterval) {
            console.log('[Test] Stopping scroll stream');
            clearInterval(scrollStreamInterval);
            scrollStreamInterval = null;
        }
    });

    socket.on('disconnect', () => {
        console.log('Frontend disconnected:', socket.id);
        isIntentionalSdbDisconnect = true;
        isIntentionalSshDisconnect = true;
        isIntentionalSerialDisconnect = true;
        if (flushTimer) clearTimeout(flushTimer);
        if (scrollStreamInterval) clearInterval(scrollStreamInterval);
        if (sshClient) sshClient.end();
        if (sdbProcess) sdbProcess.kill();
        activeSerial.disconnect(socket.id);
    });

    // --- Remote SDB Connect ---
    socket.on('connect_sdb_remote', async ({ ip, sdbPath }) => {
        if (!ip) {
            socket.emit('sdb_remote_result', { success: false, error: 'IP address is required' });
            return;
        }

        console.log(`[SDB Remote] Connecting to ${ip}...`);

        try {
            await new Promise((resolve) => {
                const child = safeSpawn(getSdbBin(sdbPath), ['disconnect', ip], {}, '[SDB Remote/Dis]');
                child.on('close', resolve);
                child.on('error', () => resolve());
            });

            await new Promise((resolve, reject) => {
                const child = safeSpawn(getSdbBin(sdbPath), ['connect', ip], {}, '[SDB Remote/Con]');
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Connect failed with code ${code}`));
                });
                child.on('error', (err) => reject(err));
            });

            await new Promise((resolve) => {
                const child = safeSpawn(getSdbBin(sdbPath), ['root', 'on'], {}, '[SDB Remote/Root]');
                child.on('close', resolve);
                child.on('error', () => resolve());
            });

            socket.emit('sdb_remote_result', { success: true, message: 'Connected and Rooted' });
        } catch (e) {
            console.error(`[SDB Remote] Error: ${e.message}`);
            socket.emit('sdb_remote_result', { success: false, error: e.message });
        }
    });

    socket.on('list_sdb_devices', ({ sdbPath } = {}) => {
        console.log('[SDB] Listing devices...');

        const parseAndEmit = (stdout) => {
            const lines = (stdout || '').split('\n');
            const devices = [];
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('List of devices')) continue;
                if (trimmed.startsWith('*')) continue;
                if (trimmed.includes('Active code page')) continue;
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 1) {
                    const id = parts[0];
                    const type = parts.length > 1 ? parts[1] : 'unknown';
                    if (id.includes('.') || id.length > 5) {
                        devices.push({ id, type });
                    }
                }
            }
            console.log(`[SDB] Found ${devices.length} devices`);
            socket.emit('sdb_devices', devices);
        };

        const systemCmd = `sdb devices`;
        const systemFullCmd = process.platform === 'win32' ? `chcp 65001 > nul && ${systemCmd}` : systemCmd;

        activeExec(systemFullCmd, { encoding: 'utf-8' }, (error, stdout, stderr) => {
            const systemFailed = error || (stderr && (stderr.includes('not found') || stderr.includes('is not recognized')));

            if (!systemFailed) {
                parseAndEmit(stdout);
                return;
            }

            if (sdbPath && sdbPath.trim().length > 0) {
                const customCmd = `"${sdbPath}" devices`;
                const customFullCmd = process.platform === 'win32' ? `chcp 65001 > nul && ${customCmd}` : customCmd;

                activeExec(customFullCmd, { encoding: 'utf-8' }, (cErr, cOut) => {
                    if (cErr) {
                        socket.emit('sdb_devices', []);
                    } else {
                        parseAndEmit(cOut);
                    }
                });
            } else {
                socket.emit('sdb_devices', []);
            }
        });
    });
};

const PORT = 3003;

/**
 * Start the internal lightweight Socket.IO server
 */
function startServer() {
    console.log('[TIME] startServer() initiated (Lightweight Socket.IO Server)...');
    const startTime = Date.now();

    try {
        http = require('http');
        const socketIo = require('socket.io');
        Server = socketIo.Server;
        const ssh2 = require('ssh2');
        Client = ssh2.Client;
        const cp = require('child_process');
        spawn = cp.spawn;
        exec = cp.exec;
        serialService = require('./services/serialService.cjs');

        server = http.createServer((req, res) => {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('HappyTool Light Socket.IO Server');
        });

        io = new Server(server, {
            cors: { origin: "*", methods: ["GET", "POST"] },
            maxHttpBufferSize: 1e8
        });

        io.engine.on("headers", (headers) => {
            headers["Cross-Origin-Resource-Policy"] = "cross-origin";
            headers["Access-Control-Allow-Origin"] = "*";
        });

        io.on('connection', (socket) => {
            handleSocketConnection(socket, { spawn, Client, exec, serialService });
        });

        console.log(`[TIME] Socket.io initialized in ${Date.now() - startTime}ms`);
    } catch (e) {
        console.error('[CRITICAL] Failed to initialize backend dependencies:', e);
        return Promise.reject(e);
    }

    return new Promise((resolve, reject) => {
        let retries = 0;
        const maxRetries = 5;

        const attemptListen = () => {
            const onError = (err) => {
                if (err.code === 'EADDRINUSE') {
                    if (retries < maxRetries) {
                        retries++;
                        console.log(`[Server] Port ${PORT} in use, retrying (${retries}/${maxRetries})...`);
                        setTimeout(() => {
                            server.close();
                            attemptListen();
                        }, 1000);
                    } else {
                        reject(new Error(`Port ${PORT} is still busy.`));
                    }
                } else {
                    reject(err);
                }
            };

            server.listen(PORT, '127.0.0.1', () => {
                console.log(`[TIME] Backend server listening on http://127.0.0.1:${PORT} (${Date.now() - startTime}ms)`);
                server.removeListener('error', onError);
                resolve(server);
            }).once('error', onError);
        };

        attemptListen();
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer, handleSocketConnection };
