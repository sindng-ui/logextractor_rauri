/* tslint:disable */
/* eslint-disable */

export class FilterEngine {
    free(): void;
    [Symbol.dispose](): void;
    check_match(text: string): boolean;
    /**
     * ✅ Zero-copy Match: 메모리 복사 없이 버퍼 직접 참조
     */
    check_match_ptr(len: number): boolean;
    get_buffer_ptr(): number;
    constructor(case_sensitive: boolean);
    reserve_buffer(size: number): void;
    update_keywords(keywords: any): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_filterengine_free: (a: number, b: number) => void;
    readonly filterengine_check_match: (a: number, b: number, c: number) => number;
    readonly filterengine_check_match_ptr: (a: number, b: number) => number;
    readonly filterengine_get_buffer_ptr: (a: number) => number;
    readonly filterengine_new: (a: number) => number;
    readonly filterengine_reserve_buffer: (a: number, b: number) => void;
    readonly filterengine_update_keywords: (a: number, b: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
