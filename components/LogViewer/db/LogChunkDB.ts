import Dexie, { Table } from 'dexie';

/**
 * 실시간 로그 덩어리(Chunk) 인터페이스
 */
export interface LogChunk {
    id: string; // {sessionId}_{chunkIndex}
    sessionId: string;
    chunkIndex: number;
    data: Uint8Array;
    startLine: number;
    endLine: number;
    createdAt: number;
}

/**
 * 실시간 로그 RAM 캡핑을 위한 임시 저장소 (IndexedDB)
 * Dexie.js 사용
 */
export class LogChunkDB extends Dexie {
    chunks!: Table<LogChunk, string>;

    constructor() {
        super('LogChunkDB');

        this.version(1).stores({
            chunks: 'id, sessionId, chunkIndex, startLine, endLine, createdAt'
        });
    }

    /**
     * 덩어리 저장
     */
    async saveChunk(chunk: LogChunk): Promise<string> {
        return await this.chunks.put(chunk);
    }

    /**
     * 덩어리 조회
     */
    async getChunk(sessionId: string, chunkIndex: number): Promise<LogChunk | undefined> {
        return await this.chunks.get(`${sessionId}_${chunkIndex}`);
    }

    /**
     * 세션의 모든 덩어리 삭제 (세션 종료 시)
     */
    async clearSession(sessionId: string): Promise<void> {
        await this.chunks.where('sessionId').equals(sessionId).delete();
    }

    /**
     * 오래된 데이터 정리 (필요 시)
     */
    async cleanOldChunks(maxAgeMs: number): Promise<void> {
        const cutoff = Date.now() - maxAgeMs;
        await this.chunks.where('createdAt').below(cutoff).delete();
    }
}

// 싱글톤 인스턴스
export const chunkDB = new LogChunkDB();
