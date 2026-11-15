import type { MusicInfo, MusicResolver, ResolveOptions } from '../types/index.js';
export declare function registerMusicResolver(type: string, resolver: MusicResolver): () => void;
/**
 * 返回 { title, singer, url, audio, image }，封面可为空。
 * 调用级 resolvers 优先于插件注册的解析器，其次使用内置来源。
 * 保留 ID 字符串，超时覆盖完整解析过程。
 */
export declare function resolveMusicInfo(type: string, id: string | number, { fetchImpl, timeoutMs, resolvers }?: ResolveOptions): Promise<MusicInfo>;
