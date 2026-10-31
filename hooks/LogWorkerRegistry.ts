import LogProcessorWorker from '../workers/LogProcessor.worker?worker';

interface WorkerState {
    worker: any;
    ready: boolean;
    totalLines: number;
    path: string | null;
}

interface WorkerPair {
    left: WorkerState;
    right: WorkerState;
}

/**
 * 탭 ID별로 로그 프로세서 워커 인스턴스 및 상태를 관리하는 레지스트리입니다.
 * 리액트 컴포넌트가 재마운트되어도 워커와 데이터를 유지하여 불필요한 재인덱싱을 방지합니다. 🐧🛡️
 */
class LogWorkerRegistry {
    private workers = new Map<string, WorkerPair>();

    /**
     * 모든 등록된 워커 쌍을 가져옵니다. 🐧⚡
     */
    getAllWorkers(): Map<string, WorkerPair> {
        return this.workers;
    }

    /**
     * 특정 탭의 워커 쌍을 가져옵니다. 없으면 새로 생성합니다.
     */
    getWorkers(tabId: string): WorkerPair {
        if (!this.workers.has(tabId)) {
            console.log(`[LogWorkerRegistry] Creating new workers for tab: ${tabId} 🏭`);
            this.workers.set(tabId, {
                left: { worker: new LogProcessorWorker(), ready: false, totalLines: 0, path: null },
                right: { worker: new LogProcessorWorker(), ready: false, totalLines: 0, path: null }
            });
        } else {
            console.log(`[LogWorkerRegistry] Reusing existing workers for tab: ${tabId} ♻️`);
        }
        return this.workers.get(tabId)!;
    }

    /**
     * 워커의 상태를 업데이트합니다.
     */
    updateState(tabId: string, pane: 'left' | 'right', state: Partial<Omit<WorkerState, 'worker'>>) {
        const pair = this.workers.get(tabId);
        if (pair) {
            pair[pane] = { ...pair[pane], ...state };
        }
    }

    /**
     * 탭이 영구적으로 닫힐 때 워커를 종료하고 메모리를 해제합니다.
     */
    terminateWorkers(tabId: string) {
        const pair = this.workers.get(tabId);
        if (pair) {
            console.log(`[LogWorkerRegistry] Terminating workers for tab: ${tabId} 💥`);
            pair.left.worker.terminate();
            pair.right.worker.terminate();
            this.workers.delete(tabId);
        }
    }

    /**
     * 모든 워커를 종료합니다. (앱 종료 또는 전체 초기화 시 사용)
     */
    clearAll() {
        console.log(`[LogWorkerRegistry] Clearing all registered workers... 🧹`);
        for (const tabId of this.workers.keys()) {
            this.terminateWorkers(tabId);
        }
    }
}

export const workerRegistry = new LogWorkerRegistry();
