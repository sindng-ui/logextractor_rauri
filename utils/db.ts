import Dexie, { Table } from 'dexie';

export interface AppState {
    key: string;
    value: any;
}

export class HappyToolDB extends Dexie {
    appState!: Table<AppState>;

    constructor() {
        super('HappyToolDB');
        this.version(1).stores({
            appState: 'key' // Primary key is 'key'
        });
    }
}

export const db = new HappyToolDB();

// Helper functions to mimic localStorage interface but async
export const getStoredValue = async (key: string, defaultValue: any = null) => {
    try {
        const result = await db.appState.get(key);
        return result ? result.value : defaultValue;
    } catch (e) {
        console.error(`Failed to get value for ${key}`, e);
        return defaultValue;
    }
};

export const setStoredValue = async (key: string, value: any) => {
    try {
        await db.appState.put({ key, value });
    } catch (e) {
        console.error(`[DB] Failed to set value for ${key}`, e);
    }
};

export const deleteStoredValue = async (key: string) => {
    try {
        await db.appState.delete(key);
    } catch (e) {
        console.error(`[DB] Failed to delete value for ${key}`, e);
    }
};
