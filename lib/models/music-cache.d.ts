import type { CacheRecord, NormalizedRequest } from '../types/index.js';
export declare class MusicCardCache {
    readonly directory: string;
    constructor(directory: string | URL);
    path(key: string): string;
    get(key: string): Promise<CacheRecord | null>;
    set(key: string, raw: string, request: NormalizedRequest): Promise<void>;
}
