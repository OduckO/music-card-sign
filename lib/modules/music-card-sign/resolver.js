import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveMusicInfo } from '../../models/music-info.js';
export const resolveWithHandler = async (type, id, options = {}) => {
    if (Object.hasOwn(options.resolvers ?? {}, type))
        return resolveMusicInfo(type, id, options);
    const { default: handler } = (await import(pathToFileURL(createRequire(import.meta.url).resolve('../../../../../lib/plugins/handler')).href));
    const key = `music.info.${type}`;
    if (!handler.has(key))
        return resolveMusicInfo(type, id, options);
    return resolveMusicInfo(type, id, {
        ...options,
        resolvers: {
            ...options.resolvers,
            [type]: (songId, context) => handler.call(key, context, { type, id: songId })
        }
    });
};
