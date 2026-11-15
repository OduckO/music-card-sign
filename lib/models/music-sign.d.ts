import type { AppPlatform, CardCache, IcqqBot, MusicCard, MusicRequest, NormalizedRequest, PendingRequest, PlatformInput, ResolveMusic, SignerOptions, SignOptions, Subscription } from '../types/index.js';
export declare function cardText(card: MusicCard): string;
export declare class MusicSignError extends Error {
    readonly status: number;
    constructor(message: string, status?: number);
}
export declare function selectPlatform(data: MusicRequest, customPlatforms: Record<string, PlatformInput>): AppPlatform;
export declare function normalizeRequest(input: unknown, customPlatforms?: Record<string, PlatformInput>): NormalizedRequest;
export declare class MusicSigner {
    readonly getBots: SignerOptions['getBots'];
    botId: string | number;
    readonly timeoutMs: number;
    readonly customPlatforms: Record<string, PlatformInput>;
    readonly resolveMusic?: ResolveMusic;
    readonly cache?: CardCache;
    readonly onCacheError?: (error: unknown) => void;
    readonly pending: Map<string, PendingRequest>;
    readonly inflight: Map<string, Promise<MusicCard>>;
    readonly submissions: Map<string, Promise<MusicCard>>;
    readonly listeners: Map<IcqqBot, Subscription>;
    closed: boolean;
    constructor({ getBots, botId, timeoutMs, customPlatforms, resolveMusic, cache, onCacheError }: SignerOptions);
    bots(): IcqqBot[];
    sign(input: unknown, { forceFresh }?: SignOptions): Promise<MusicCard>;
    signRequest(bot: IcqqBot, data: MusicRequest, platform: AppPlatform, identity: string, key: string, forceFresh: boolean): Promise<MusicCard>;
    submit(bot: IcqqBot, request: NormalizedRequest, key: string): Promise<MusicCard>;
    send(bot: IcqqBot, request: NormalizedRequest, key: string): Promise<MusicCard>;
    unlisten(bot: IcqqBot): void;
    listen(bot: IcqqBot): Subscription;
    status(): {
        enabled: boolean;
        bots: string[];
        pending: number;
    };
    close(): Promise<void>;
}
