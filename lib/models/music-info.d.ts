import type { MusicInfo, MusicResolver, ResolveOptions, SearchSinger } from '../types/index.js';
export declare function musicIdFromUrl(value: string): {
    type: string;
    id: string;
} | undefined;
export declare const searchMusicSinger: SearchSinger;
export declare function registerMusicResolver(type: string, resolver: MusicResolver): () => void;
/**
 * 返回 { title, singer, url, audio, image }，歌手、音频和封面可为空。
 * 调用级 resolvers 优先于插件注册的解析器，其次使用内置来源。
 * 保留 ID 字符串，超时覆盖完整解析过程。
 */
export declare function resolveMusicInfo(type: string, id: string | number, { fetchImpl, timeoutMs, resolvers, metadataOnly }?: ResolveOptions): Promise<MusicInfo>;
