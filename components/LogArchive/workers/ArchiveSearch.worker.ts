/**
 * Archive Search Worker
 * 
 * 아카이브 검색을 백그라운드에서 처리하여 메인 스레드 블로킹 방지
 */

import { db, SearchOptions, ArchivedLog } from '../db/LogArchiveDB';

interface WorkerMessage {
    type: string;
    payload?: any;
    requestId?: string;
}

interface WorkerResponse {
    type: string;
    payload: any;
    requestId?: string;
    error?: string;
}

/**
 * Worker 메시지 핸들러
 */
self.addEventListener('message', async (e: MessageEvent<WorkerMessage>) => {
    const { type, payload, requestId } = e.data;

    try {
        let result: any;

        switch (type) {
            case 'SEARCH_ARCHIVES': {
                const options: SearchOptions = payload || {};
                const archives = await db.searchArchives(options);
                const total = await db.getArchiveCount({
                    query: options.query,
                    isRegex: options.isRegex,
                    tags: options.tags,
                    folder: options.folder,
                });

                result = {
                    archives,
                    total,
                };
                break;
            }

            case 'GET_ARCHIVE_COUNT': {
                const options = payload || {};
                result = await db.getArchiveCount(options);
                break;
            }

            case 'GET_ALL_TAGS': {
                result = await db.getAllTags();
                break;
            }

            case 'GET_ALL_FOLDERS': {
                result = await db.getAllFolders();
                break;
            }

            default:
                throw new Error(`Unknown message type: ${type}`);
        }

        const response: WorkerResponse = {
            type: `${type}_RESPONSE`,
            payload: result,
            requestId,
        };

        self.postMessage(response);
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[ArchiveSearch.worker] Error:', error);

        const response: WorkerResponse = {
            type: `${type}_ERROR`,
            payload: null,
            requestId,
            error,
        };

        self.postMessage(response);
    }
});

// Worker 준비 완료 알림
self.postMessage({ type: 'WORKER_READY', payload: null });
