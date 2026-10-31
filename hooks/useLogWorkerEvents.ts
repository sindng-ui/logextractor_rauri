import { LogWorkerResponse } from '../types';

/**
 * 펭펭! 로그 워커로부터 오는 수많은 메시지(필터링, 인덱싱, 히트맵 등)를 처리하는 훅입니다. 🐧⚙️
 */
export function useLogWorkerEvents() {

    /**
     * 워커로부터 온 메시지를 분석하여 상태를 업데이트합니다. 🐧✨
     */
    const handleWorkerMessage = (
        e: MessageEvent<LogWorkerResponse>,
        props: {
            setIndexingProgress: (p: number) => void;
            setWorkerReady: (r: boolean) => void;
            setTotalLines: (t: number) => void;
            setFilteredCount: (c: number) => void;
            setBookmarks: (b: Set<number>) => void;
            setPerformanceHeatmap: (h: number[]) => void;
            setActiveLineIndex?: (i: number) => void;
            setSelectedIndices?: (s: Set<number>) => void;
            handleAnalysisMessage: (paneId: 'left' | 'right', type: string, payload: any) => void;
            setSharedBuffers?: (buffers: any) => void;
            workerRef: React.MutableRefObject<Worker | null>;
            pendingRequests: React.MutableRefObject<Map<string, (data: any) => void>>;
            pane: 'left' | 'right';
            onIndexComplete?: () => void; // 🐧 v9: 인덱스 완료 시 강제 리셋 콜백
        }
    ) => {
        const { type, payload, requestId } = e.data;
        const {
            setIndexingProgress,
            setWorkerReady,
            setTotalLines,
            setFilteredCount,
            setBookmarks,
            setPerformanceHeatmap,
            setActiveLineIndex,
            setSelectedIndices,
            handleAnalysisMessage,
            workerRef,
            pendingRequests,
            pane
        } = props;

        // 1. Request ID 기반 비동기 응답 처리 (GET_LINES, FIND_TEXT 등)
        if (requestId && pendingRequests.current.has(requestId)) {
            const resolve = pendingRequests.current.get(requestId);
            if (type === 'LINES_DATA') {
                resolve && resolve(payload.lines);
            } else if (type === 'FIND_RESULT') {
                resolve && resolve(payload);
            } else if (type === 'FULL_TEXT_DATA') {
                resolve && resolve(payload);
            }
            pendingRequests.current.delete(requestId);
            return;
        }

        // 2. 공통 이벤트 처리 (switch-case)
        switch (type) {
            case 'RPC_REQUEST': {
                if (payload?.method === 'readFileSegment') {
                    const { path, start, end } = payload.args;
                    console.log(`[useLog-${pane}] Handling RPC_REQUEST: readFileSegment`, { path, start, end });
                    if (!window.electronAPI?.readFileSegment) {
                        console.error(`[useLog-${pane}] window.electronAPI.readFileSegment is missing!`);
                        workerRef.current?.postMessage({
                            type: 'RPC_ERROR',
                            requestId,
                            payload: 'electronAPI.readFileSegment is missing'
                        });
                        return;
                    }
                    window.electronAPI.readFileSegment({ path, start, end })
                        .then(chunkBuffer => {
                            // Ensure we have a clean ArrayBuffer for transfer
                            const finalBuffer = new Uint8Array(chunkBuffer);
                            console.log(`[useLog-${pane}] RPC_RESPONSE success, length:`, finalBuffer.length);
                            workerRef.current?.postMessage({
                                type: 'RPC_RESPONSE',
                                requestId,
                                payload: finalBuffer
                            }, [finalBuffer.buffer]); // 제로 카피 버퍼 트랜스퍼 🚀
                        })
                        .catch(err => {
                            console.error(`[useLog-${pane}] RPC_RESPONSE error:`, err);
                            workerRef.current?.postMessage({
                                type: 'RPC_ERROR',
                                requestId,
                                payload: err?.message || 'Read failed'
                            });
                        });
                }
                break;
            }
            case 'STATUS_UPDATE':
                if (payload.status === 'indexing' || payload.status === 'filtering' || payload.status === 'loading') {
                    setWorkerReady?.(false);
                    if (payload.status === 'indexing') setIndexingProgress?.(payload.progress);
                } else if (payload.status === 'ready') {
                    setWorkerReady?.(true);
                }
                break;

            case 'STREAM_DONE':
                // 스트림 로딩 완료 시점에 ready로 전환하여 useEffect 트리거
                setWorkerReady(true);
                break;

            case 'INDEX_COMPLETE':
                console.log(`[PINGU-DEBUG-RECEIVE] INDEX_COMPLETE: totalLines=${payload.totalLines}, pane=${pane}`);
                setTotalLines(payload.totalLines);
                // 🐧 형님! 인덱싱이 끝났을 때는 디폴트로 전체 로그가 다 보여야 하므로 filteredCount를 즉시 안전하게 초기화해 줍니다!
                setFilteredCount(payload.totalLines);
                setIndexingProgress(100);
                // 인덱싱 완료 시점에 ready로 전환하여 useEffect 트리거
                setWorkerReady(true);
                // 🐧 v9: 인덱스 완료 시 등록된 캐시 초기화 콜백 실행!
                if (props.onIndexComplete) props.onIndexComplete();
                break;

            case 'FILTER_COMPLETE':
                console.log(`[PINGU-DEBUG-RECEIVE] FILTER_COMPLETE: matchCount=${payload.matchCount}, totalLines=${payload.totalLines}, pane=${pane}`);
                setFilteredCount(payload.matchCount);
                if (typeof payload.totalLines === 'number') setTotalLines(payload.totalLines);
                if (payload.visualBookmarks) {
                    setBookmarks(new Set(payload.visualBookmarks));
                }
                setWorkerReady(true);

                // 일부 동작(선택 초기화 등)은 필요한 경우에만 수행
                if (setActiveLineIndex) setActiveLineIndex(-1);
                if (setSelectedIndices) setSelectedIndices(new Set());

                // 💡 성능 히트맵 자동 요청 (500 포인트)
                workerRef.current?.postMessage({ type: 'GET_PERFORMANCE_HEATMAP', payload: { points: 500 } });
                break;

            case 'HEATMAP_DATA':
                // console.log(`[useLog-${pane}] Received HEATMAP_DATA`);
                setPerformanceHeatmap(payload.heatmap || []);
                break;

            case 'BOOKMARKS_UPDATED':
                if (payload.visualBookmarks) {
                    setBookmarks(new Set(payload.visualBookmarks));
                }
                break;

            case 'BUFFER_SHARED':
                // console.log(`[useLog-${pane}] Received BUFFER_SHARED`, payload);
                if (props.setSharedBuffers) {
                    props.setSharedBuffers(payload);
                }
                break;

            case 'ERROR':
                console.error(`[useLog-${pane}] Worker Error:`, payload.error);
                break;

            default:
                // 상세 분석 메시지(Transaction, Perf, Spam 등)는 별도 핸들러로 위임
                handleAnalysisMessage(pane, type, payload);
                break;
        }
    };

    return { handleWorkerMessage };
}
