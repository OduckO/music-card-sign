import type { CommandEvent, Config, MusicRequest, SignOptions } from '../../types/index.js';
export declare function startService(): Promise<void>;
export declare function stopService(): Promise<void>;
export declare function getServiceStatus(): Promise<{
    enabled: boolean;
    bots: string[];
    pending: number;
    targetId: string;
} | undefined>;
export declare function getTestMusic(): Promise<MusicRequest>;
export declare function updateSettings(patch: Partial<Config>): Promise<void>;
export declare function setServiceEnabled(enabled: boolean): Promise<string>;
export declare function setSigningBot(botId: string): Promise<string>;
export declare function signCard(e: Pick<CommandEvent, 'self_id'>, data: MusicRequest, reject: (message: string) => never, options?: SignOptions): Promise<string>;
