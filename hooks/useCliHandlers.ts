export const useCliHandlers = () => {
    const logOut = (msg: string) => {
        if (window.electronAPI?.cliStdout) {
            window.electronAPI.cliStdout(msg + '\n');
        }
    };

    const logErr = (msg: string) => {
        if (window.electronAPI?.cliStderr) {
            window.electronAPI.cliStderr(msg + '\n');
        }
    };

    const handleLogExtractor = async (payload: any, stdout: (msg: string) => void, stderr: (msg: string) => void) => {
        const { filterName, inputPath, outputPath, cwd } = payload;
        let settings: any = null;

        if (window.electronAPI?.getCliSettings) {
            settings = await window.electronAPI.getCliSettings();
        }

        if (!settings) {
            const settingsStr = localStorage.getItem('devtool_suite_settings');
            if (settingsStr) settings = JSON.parse(settingsStr);
        }

        if (!settings) {
            throw new Error('No HappyTool settings found. Please run the GUI first to save your filters.');
        }

        const logRules = settings.logRules || [];
        const defaultOutputFolder = settings.defaultOutputFolder || '';

        const matches = logRules.filter((r: any) => r.name === filterName);
        if (matches.length === 0) {
            stderr(`[Error] Filter (Mission) named "${filterName}" does not exist.`);
            return;
        } else if (matches.length > 1) {
            stderr(`[Error] Found ${matches.length} filters named "${filterName}". Please rename them in GUI to be unique.`);
            return;
        }

        const rule = matches[0];
        stdout(`[Log Extractor] Found Filter: "${rule.name}"`);
        stdout(`[Log Extractor] Input: ${inputPath}`);

        const { assembleIncludeGroups } = await import('../utils/filterGroupUtils');
        const LogProcessorWorker = (await import('../workers/LogProcessor.worker.ts?worker')).default;

        const worker = new LogProcessorWorker();
        let totalLines = 0;
        let filteredCount = 0;

        return new Promise<void>(async (resolve, reject) => {
            const finalOutputPath = outputPath || (defaultOutputFolder
                ? `${defaultOutputFolder}\\extracted_${Date.now()}.txt`
                : `${cwd}\\extracted_${Date.now()}.txt`);

            worker.onmessage = async (e: MessageEvent) => {
                const { type, payload, requestId } = e.data;

                if (type === 'STATUS_UPDATE' && payload.progress !== undefined) {
                    const statusText = payload.status === 'filtering' ? 'Filtering' : 'Indexing';
                    const progress = Math.round(payload.progress);
                    if (progress % 20 === 0 || progress === 100) {
                        stdout(`[Log Extractor] ${statusText}... ${progress}%`);
                    }
                } else if (type === 'INDEX_COMPLETE') {
                    totalLines = payload.totalLines;
                    stdout(`[Log Extractor] Indexing Complete. Total Lines: ${totalLines.toLocaleString()}`);

                    const refinedGroups = assembleIncludeGroups(rule);
                    stdout(`[Log Extractor] Starting Filter Engine...`);
                    worker.postMessage({
                        type: 'FILTER_LOGS',
                        payload: { ...rule, includeGroups: refinedGroups, quickFilter: 'none' }
                    });
                } else if (type === 'FILTER_COMPLETE') {
                    filteredCount = payload.matchCount !== undefined ? payload.matchCount : payload.count;
                    stdout(`[Log Extractor] Filtering Complete. Match count: ${filteredCount.toLocaleString()}`);

                    if (filteredCount === 0) {
                        stdout(`[Log Extractor] 0 matches found. No file created.`);
                        worker.terminate();
                        resolve();
                        return;
                    }

                    stdout(`[Log Extractor] Preparing export...`);
                    worker.postMessage({ type: 'GET_FULL_TEXT', requestId: 'cli-export' });
                } else if (type === 'FULL_TEXT_DATA' && requestId === 'cli-export') {
                    let content = '';
                    if (payload.buffer) {
                        const decoder = new TextDecoder();
                        content = decoder.decode(payload.buffer);
                    } else {
                        content = payload.text || '';
                    }

                    stdout(`[Log Extractor] Writing to ${finalOutputPath}...`);
                    const encoder = new TextEncoder();
                    const uint8 = encoder.encode(content);
                    const result = await window.electronAPI!.saveFileDirect(uint8, finalOutputPath);

                    if (result && result.status === 'success') {
                        stdout(`[Success] Extracted logs saved to: ${result.filePath}`);
                    } else {
                        stderr(`[Error] Failed to save file: ${result?.error || 'Unknown error'}`);
                        worker.terminate();
                        reject(new Error(result?.error || 'Failed to save file'));
                        return;
                    }

                    worker.terminate();
                    resolve();
                } else if (type === 'ERROR') {
                    stderr(`[Worker Error] ${payload}`);
                    worker.terminate();
                    reject(new Error(payload));
                } else if (type === 'RPC_REQUEST') {
                    const { method, args } = payload;
                    if (method === 'readFileSegment') {
                        try {
                            const result = await window.electronAPI!.readFileSegment(args);
                            worker.postMessage({ type: 'RPC_RESPONSE', requestId, payload: result });
                        } catch (err: any) {
                            worker.postMessage({ type: 'RPC_ERROR', requestId, payload: { error: err.message } });
                        }
                    }
                }
            };

            worker.onerror = (e) => {
                stderr(`[Worker Fatal Error] ${e.message}`);
                worker.terminate();
                reject(new Error(e.message));
            };

            try {
                const size = await window.electronAPI!.getFileSize(inputPath);
                stdout(`[Log Extractor] File Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
                worker.postMessage({
                    type: 'INIT_LOCAL_FILE_STREAM',
                    payload: { path: inputPath, size }
                });
            } catch (error: any) {
                stderr(`[Error] Failed to initialize file read: ${error.message}`);
                worker.terminate();
                reject(error);
            }
        });
    };

    const handleAnalyzeDiff = async (payload: any, stdout: (msg: string) => void, stderr: (msg: string) => void) => {
        const { filterName, leftPath, rightPath, outputPath, cwd } = payload;
        const CLI_VERSION = '1.1.4-DEBUG-V2';

        stdout(`[Analyze Diff][${CLI_VERSION}] Starting analysis...`);
        stdout(`[Analyze Diff] Filter: ${filterName}`);
        stdout(`[Analyze Diff] Left: ${leftPath}`);
        stdout(`[Analyze Diff] Right: ${rightPath}`);

        let settings: any = window.electronAPI?.getCliSettings ? await window.electronAPI.getCliSettings() : null;
        if (!settings) {
            const settingsStr = localStorage.getItem('devtool_suite_settings');
            if (settingsStr) settings = JSON.parse(settingsStr);
        }
        if (!settings) throw new Error('No settings found. Run GUI first.');

        const rule = settings.logRules?.find((r: any) => r.name === filterName);
        if (!rule) throw new Error(`Filter "${filterName}" not found.`);

        const { assembleIncludeGroups } = await import('../utils/filterGroupUtils');
        const LogProcessorWorker = (await import('../workers/LogProcessor.worker.ts?worker')).default;
        const SplitAnalysisWorker = (await import('../workers/SplitAnalysis.worker.ts?worker')).default;

        const leftWorker = new LogProcessorWorker();
        const rightWorker = new LogProcessorWorker();

        const filterLog = (worker: Worker, path: string, side: string) => {
            return new Promise<void>(async (resolve, reject) => {
                worker.onmessage = (e) => {
                    const { type, payload } = e.data;
                    if (type === 'STATUS_UPDATE' && payload.progress !== undefined) {
                        if (payload.progress % 25 === 0 || payload.progress === 100) {
                            const statusLabel = payload.status === 'indexing' ? 'Indexing' : 'Filtering';
                            stdout(`[Analyze Diff][${side}] ${statusLabel}... ${Math.round(payload.progress)}%`);
                        }
                    } else if (type === 'ERROR') {
                        stderr(`[Analyze Diff][${side}] Worker Error: ${payload}`);
                        reject(new Error(payload));
                    } else if (type === 'INDEX_COMPLETE') {
                        stdout(`[Analyze Diff][${side}] Indexing Complete. Lines: ${payload.totalLines}`);
                        worker.postMessage({
                            type: 'FILTER_LOGS',
                            payload: { ...rule, includeGroups: assembleIncludeGroups(rule), quickFilter: 'none' }
                        });
                    } else if (type === 'FILTER_COMPLETE') {
                        stdout(`[Analyze Diff][${side}] Filtering Complete. Matches: ${payload.matchCount}`);
                        resolve();
                    } else if (type === 'RPC_REQUEST') {
                        const { method, args } = payload;
                        if (method === 'readFileSegment') {
                            window.electronAPI!.readFileSegment(args).then(res =>
                                worker.postMessage({ type: 'RPC_RESPONSE', requestId: e.data.requestId, payload: res })
                            ).catch(err =>
                                worker.postMessage({ type: 'RPC_ERROR', requestId: e.data.requestId, payload: { error: err.message } })
                            );
                        }
                    }
                };
                worker.onerror = (e) => {
                    stderr(`[Analyze Diff][${side}] Worker Fatal Error: ${e.message}`);
                    reject(new Error(e.message));
                };
                const size = await window.electronAPI!.getFileSize(path);
                stdout(`[Analyze Diff][${side}] File Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
                worker.postMessage({ type: 'INIT_LOCAL_FILE_STREAM', payload: { path, size } });
            });
        };

        const getMetrics = (worker: Worker, side: string) => {
            return new Promise<any>((resolve, reject) => {
                const reqId = `cli-${side}-metrics`;
                const timeout = setTimeout(() => {
                    worker.removeEventListener('message', listener);
                    reject(new Error(`[Analyze Diff][${side.toUpperCase()}] getMetrics Timeout (15s)`));
                }, 15000);

                const listener = (e: MessageEvent) => {
                    const { type, payload, requestId } = e.data;
                    if (type === 'ANALYSIS_METRICS_RESULT' && requestId === reqId) {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', listener);
                        resolve(payload);
                    } else if (type === 'STATUS_UPDATE' && payload.message) {
                        stdout(`[Analyze Diff][${side.toUpperCase()}] ${payload.message}`);
                    }
                };
                worker.addEventListener('message', listener);
                worker.postMessage({ type: 'GET_ANALYSIS_METRICS', payload: { side }, requestId: reqId });
            });
        };

        const getAliasEvents = (worker: Worker, side: string) => {
            return new Promise<any[]>((resolve, reject) => {
                const reqId = `cli-${side}-alias`;
                const timeout = setTimeout(() => {
                    worker.removeEventListener('message', listener);
                    reject(new Error(`[Analyze Diff][${side.toUpperCase()}] getAliasEvents Timeout (15s)`));
                }, 15000);

                const listener = (e: MessageEvent) => {
                    const { type, payload, requestId } = e.data;
                    if (type === 'ALIAS_EVENTS_RESULT' && requestId === reqId) {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', listener);
                        resolve(payload.events || []);
                    } else if (type === 'STATUS_UPDATE' && payload.message) {
                        stdout(`[Analyze Diff][${side.toUpperCase()}] ${payload.message}`);
                    }
                };
                worker.addEventListener('message', listener);
                worker.postMessage({ type: 'GET_ALIAS_EVENTS', requestId: reqId });
            });
        };

        try {
            await Promise.all([
                filterLog(leftWorker, leftPath, 'LEFT'),
                filterLog(rightWorker, rightPath, 'RIGHT')
            ]);

            stdout(`[Analyze Diff] Extracting metrics and aliases (Simultaneous)...`);
            const [leftData, rightData, leftAlias, rightAlias] = await Promise.all([
                getMetrics(leftWorker, 'left'),
                getMetrics(rightWorker, 'right'),
                getAliasEvents(leftWorker, 'left'),
                getAliasEvents(rightWorker, 'right')
            ]);

            stdout(`[Analyze Diff] Metrics extracted. LeftSeq: ${leftData?.sequence?.length || 0}, RightSeq: ${rightData?.sequence?.length || 0}`);
            stdout(`[Analyze Diff] Aliases extracted. Left: ${leftAlias?.length || 0}, Right: ${rightAlias?.length || 0}`);

            if (!leftData?.sequence || !rightData?.sequence) {
                throw new Error(`[Analyze Diff] Critical Error: Missing sequence data. Left: ${!!leftData?.sequence}, Right: ${!!rightData?.sequence}`);
            }

            stdout(`[Analyze Diff] Running comparison analysis...`);
            const results = await new Promise<any>((resolve) => {
                const analyzer = new SplitAnalysisWorker();
                analyzer.onmessage = (e) => {
                    const { type, payload } = e.data;
                    if (type === 'SPLIT_ANALYSIS_COMPLETE') {
                        analyzer.terminate();
                        resolve(payload);
                    }
                };
                analyzer.postMessage({
                    leftSequence: leftData.sequence,
                    rightSequence: rightData.sequence,
                    leftPointMetrics: leftData.pointMetrics,
                    rightPointMetrics: rightData.pointMetrics,
                    leftAliasEvents: leftAlias,
                    rightAliasEvents: rightAlias
                });
            });

            stdout(`[Analyze Diff] Analysis complete. Raw nodes: ${results.results?.length || 0}`);

            const intervalResults = (results.results || []).filter((r: any) => (r.leftAvgDelta > 0 && r.rightAvgDelta > 0) || r.isAliasInterval);
            stdout(`[Analyze Diff] Filtered interval results (>0ms): ${intervalResults.length}`);
            const pointResults = results.pointResults || [];

            const mapInterval = (r: any) => ({
                key: r.key,
                leftAvgDelta: r.leftAvgDelta,
                rightAvgDelta: r.rightAvgDelta,
                deltaDiff: r.deltaDiff
            });

            const sortByDeltaAbs = (a: any, b: any) => Math.abs(b.deltaDiff) - Math.abs(a.deltaDiff);

            const regressions = intervalResults
                .filter((r: any) => r.deltaDiff > 20)
                .sort(sortByDeltaAbs)
                .map(mapInterval);

            const improvements = intervalResults
                .filter((r: any) => r.deltaDiff < -20)
                .sort(sortByDeltaAbs)
                .map(mapInterval);

            const stable = intervalResults
                .filter((r: any) => Math.abs(r.deltaDiff) <= 20)
                .sort(sortByDeltaAbs)
                .map(mapInterval);

            const newLogs = [...pointResults]
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .map((r: any) => ({
                    sig: r.sig,
                    count: r.count
                }));

            const finalData = {
                filterName,
                timestamp: new Date().toISOString(),
                files: { left: leftPath, right: rightPath },
                summary: {
                    totalNodes: intervalResults.length,
                    regressionsCount: regressions.length,
                    improvementsCount: improvements.length,
                    stableCount: stable.length,
                    newLogsCount: newLogs.length
                },
                results: {
                    regressions,
                    improvements,
                    stable,
                    newLogs
                }
            };

            const finalOutputPath = outputPath || `${cwd}\\diff_result_${Date.now()}.json`;
            stdout(`[Analyze Diff] Saving result to ${finalOutputPath}...`);

            const content = JSON.stringify(finalData, null, 2);
            const encoder = new TextEncoder();
            const uint8 = encoder.encode(content);
            await window.electronAPI!.saveFileDirect(uint8, finalOutputPath);

            stdout(`[Success] Analysis complete. Result saved to: ${finalOutputPath}`);

            leftWorker.terminate();
            rightWorker.terminate();

        } catch (e: any) {
            stderr(`[Error] Analyze Diff failed: ${e.message}`);
            leftWorker.terminate();
            rightWorker.terminate();
            throw e;
        }
    };

    return {
        logOut,
        logErr,
        handleLogExtractor,
        handleAnalyzeDiff
    };
};
