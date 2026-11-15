import type { MusicRequest, PlatformInput } from './music.js';
export interface Config {
    enabled: boolean;
    botId: string;
    path: string;
    timeoutMs: number;
    localPort: number;
    apiKey: string;
    platforms: Record<string, PlatformInput>;
    testMusic: MusicRequest;
}
