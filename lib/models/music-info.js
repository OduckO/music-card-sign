const PLATFORMS = new Set(['qq', '163', 'kugou', 'kuwo', 'migu']);
function musicError(code, type, message, cause) {
    const error = Object.assign(new Error(`${type}: ${message}`, cause === undefined ? undefined : { cause }), { code, platform: type, status: undefined });
    error.code = code;
    error.platform = type;
    return error;
}
function httpUrl(value, type, field) {
    if (typeof value !== 'string') {
        throw musicError('ERR_MUSIC_URL', type, `${field} 必须是 HTTP(S) URL`);
    }
    const text = value.trim().replace(/^\/\//, 'https://');
    let url;
    try {
        url = new URL(text);
    }
    catch {
        throw musicError('ERR_MUSIC_URL', type, `${field} 不是有效的 HTTP(S) URL`);
    }
    if (!/^https?:\/\//i.test(text) || !['http:', 'https:'].includes(url.protocol)) {
        throw musicError('ERR_MUSIC_URL', type, `${field} 只允许 HTTP(S) URL`);
    }
    return url.href;
}
function sameId(left, right) {
    const a = String(left ?? '');
    const b = String(right);
    return /^\d+$/.test(a) && /^\d+$/.test(b)
        ? a.replace(/^0+(?=\d)/, '') === b.replace(/^0+(?=\d)/, '')
        : a === b;
}
function checkCode(data, type, success) {
    if (!data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        (data.code !== undefined && String(data.code) !== String(success))) {
        throw musicError('ERR_MUSIC_RESPONSE', type, '官方接口返回失败或无效响应');
    }
    return data;
}
function metadataError(type) {
    return musicError('ERR_MUSIC_METADATA', type, '官方接口未返回与 ID 匹配的歌曲信息');
}
function validateInfo(info, type) {
    if (!info || typeof info.title !== 'string' || !info.title.trim()) {
        throw metadataError(type);
    }
    if (info.singer !== undefined && info.singer !== null && typeof info.singer !== 'string') {
        throw metadataError(type);
    }
    return {
        title: info.title.trim(),
        singer: info.singer?.trim() ?? '',
        url: httpUrl(info.url, type, 'url'),
        audio: info.audio === undefined || info.audio === null || info.audio === ''
            ? ''
            : httpUrl(info.audio, type, 'audio'),
        image: info.image === undefined || info.image === null || info.image === ''
            ? ''
            : httpUrl(info.image, type, 'image')
    };
}
// QQ: fcg_play_single_song -> CgiGetVkey -> response sip + matching purl.
async function qq(id, { json, metadataOnly }) {
    const type = 'qq';
    const key = /^\d+$/.test(id) ? 'songid' : 'songmid';
    const detail = checkCode(await json('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg', {
        [key]: id,
        format: 'json',
        platform: 'yqq.json'
    }), type, 0);
    const song = Array.isArray(detail.data) &&
        detail.data.find((item) => item && sameId(key === 'songid' ? (item.id ?? item.songid) : (item.mid ?? item.songmid), id));
    const mid = song?.mid ?? song?.songmid;
    if (!song || typeof mid !== 'string' || !/^[a-z\d]+$/i.test(mid))
        throw metadataError(type);
    const album = song.album;
    const info = {
        title: song.title || song.name,
        singer: Array.isArray(song.singer)
            ? song.singer
                .map((artist) => artist?.name)
                .filter(Boolean)
                .join(' / ')
            : '',
        url: `https://y.qq.com/n/ryqq/songDetail/${mid}`,
        audio: '',
        image: album?.picUrl ||
            (typeof album?.mid === 'string' && /^[a-z\d]+$/i.test(album.mid)
                ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid}.jpg`
                : '')
    };
    if (metadataOnly)
        return info;
    const response = checkCode(await json('https://u.y.qq.com/cgi-bin/musicu.fcg', {}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            comm: { ct: 24, cv: 0, format: 'json', uin: 0 },
            req_0: {
                module: 'vkey.GetVkeyServer',
                method: 'CgiGetVkey',
                param: {
                    guid: String(Date.now()),
                    songmid: [mid],
                    songtype: [0],
                    uin: '0',
                    loginflag: 1,
                    platform: '20'
                }
            }
        })
    }), type, 0);
    const vkey = checkCode(response.req_0, type, 0).data;
    const item = Array.isArray(vkey?.midurlinfo) &&
        vkey.midurlinfo.find((entry) => entry?.songmid === mid);
    const purl = item?.purl;
    if (typeof purl !== 'string' || !purl.trim())
        return info;
    if (/^[a-z][a-z\d+.-]*:/i.test(purl)) {
        info.audio = purl;
    }
    else {
        const origin = Array.isArray(vkey?.sip) &&
            vkey.sip.find((value) => typeof value === 'string' && value.trim());
        if (origin)
            info.audio = new URL(purl, httpUrl(origin, type, 'audio origin')).href;
    }
    return info;
}
// 163: song/detail -> song/enhance/player/url; no guessed song/media/outer URL.
async function netease(id, { json, metadataOnly }) {
    const type = '163';
    const ids = JSON.stringify([id]);
    const detail = checkCode(await json('https://music.163.com/api/song/detail', { ids }), type, 200);
    const song = Array.isArray(detail.songs) &&
        detail.songs.find((item) => item && sameId(item.id, id));
    if (!song)
        throw metadataError(type);
    const artists = song.artists ?? song.ar;
    const info = {
        title: song.name,
        singer: Array.isArray(artists)
            ? artists
                .map((item) => item?.name)
                .filter(Boolean)
                .join(' / ')
            : '',
        url: `https://music.163.com/song?id=${id}`,
        audio: '',
        image: (song.album ?? song.al)?.picUrl
    };
    if (metadataOnly)
        return info;
    const response = checkCode(await json('https://music.163.com/api/song/enhance/player/url', {
        ids,
        br: '128000'
    }), type, 200);
    const audio = Array.isArray(response.data) &&
        response.data.find((item) => item && sameId(item.id, id));
    if (audio && (audio.code === undefined || String(audio.code) === '200'))
        info.audio = audio.url;
    return info;
}
// Kugou: mobile playInfo returns songName/singerName/url/imgUrl for the requested hash.
async function kugou(id, { json }) {
    const type = 'kugou';
    const song = await json('https://m.kugou.com/app/i/getSongInfo.php', {
        cmd: 'playInfo',
        hash: id
    });
    if (!song || (song.status !== undefined && String(song.status) !== '1')) {
        throw musicError('ERR_MUSIC_RESPONSE', type, '官方 playInfo 接口返回失败');
    }
    if (song.hash !== undefined && String(song.hash).toLowerCase() !== id.toLowerCase())
        throw metadataError(type);
    const image = song.trans_param?.union_cover || song.album_img || song.imgUrl;
    return {
        title: song.songName,
        singer: song.singerName || song.author_name,
        url: `https://www.kugou.com/song/#hash=${id}`,
        audio: song.url,
        image: typeof image === 'string' ? image.replace(/\{size\}/g, '400') : image
    };
}
// Kuwo: musicInfo -> playUrl. Public web APIs may require cookies/CSRF on live servers.
async function kuwo(id, { json, metadataOnly }) {
    const type = 'kuwo';
    const detail = checkCode(await json('https://www.kuwo.cn/api/www/music/musicInfo', {
        mid: id,
        httpsStatus: '1'
    }), type, 200);
    const song = detail.data;
    if (!song || (song.rid !== undefined && !sameId(song.rid, id)))
        throw metadataError(type);
    const info = {
        title: song.name,
        singer: song.artist,
        url: `https://www.kuwo.cn/play_detail/${id}`,
        audio: '',
        image: song.pic
    };
    if (metadataOnly)
        return info;
    const response = checkCode(await json('https://www.kuwo.cn/api/v1/www/music/playUrl', {
        mid: id,
        type: 'convert_url',
        httpsStatus: '1'
    }), type, 200);
    info.audio = response.data?.url;
    return info;
}
// Migu legacy getSongInfo: songItem.songName/singer/img/mp3.
async function migu(id, { json }) {
    const type = 'migu';
    const response = await json('https://music.migu.cn/v3/api/music/audioPlayer/getSongInfo', {
        copyrightId: id
    });
    if (!response ||
        (response.returnCode !== undefined && String(response.returnCode) !== '000000')) {
        throw musicError('ERR_MUSIC_RESPONSE', type, '官方 getSongInfo 接口返回失败');
    }
    const song = response.songItem;
    if (!song || (song.copyrightId !== undefined && !sameId(song.copyrightId, id)))
        throw metadataError(type);
    return {
        title: song.songName,
        singer: song.singer,
        url: `https://music.migu.cn/v3/music/song/${id}`,
        audio: song.mp3,
        image: song.img
    };
}
const DEFAULT_RESOLVERS = { qq, 163: netease, kugou, kuwo, migu };
const registeredResolvers = new Map();
export function musicIdFromUrl(value) {
    const url = new URL(value);
    const path = url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin) : url;
    const host = url.hostname;
    if (host === 'music.163.com' && /^\/(?:m\/)?song\/?$/.test(path.pathname)) {
        const id = path.searchParams.get('id');
        if (id && /^\d+$/.test(id))
            return { type: '163', id };
    }
    if (host === 'y.qq.com' || host === 'i.y.qq.com') {
        const match = path.pathname.match(/\/song(?:Detail)?\/([a-z\d]+)(?:\.html)?\/?$/i);
        const id = match?.[1] ??
            (/\/(?:playsong|song)\.html$/.test(path.pathname)
                ? (path.searchParams.get('songmid') ?? path.searchParams.get('songMid'))
                : null);
        if (id && /^[a-z\d]+$/i.test(id))
            return { type: 'qq', id };
    }
    if ((host === 'www.kugou.com' || host === 'm.kugou.com') && /^\/song\/?$/.test(url.pathname)) {
        const id = new URLSearchParams(url.hash.slice(1)).get('hash') ?? url.searchParams.get('hash');
        if (id && /^[a-f\d]{32}$/i.test(id))
            return { type: 'kugou', id };
    }
    if (host === 'www.kuwo.cn' || host === 'kuwo.cn') {
        const id = path.pathname.match(/^\/play_detail\/(\d+)\/?$/)?.[1];
        if (id)
            return { type: 'kuwo', id };
    }
    if (host === 'music.migu.cn') {
        const id = path.pathname.match(/^\/v3\/music\/song\/(\d+)\/?$/)?.[1];
        if (id)
            return { type: 'migu', id };
    }
}
export const searchMusicSinger = async (title, url, options = {}) => {
    const host = new URL(url).hostname;
    const source = host === 'music.163.com' || host === '163cn.tv'
        ? '163'
        : host === 'kugou.com' || host.endsWith('.kugou.com')
            ? 'kugou'
            : 'qq';
    const expected = musicIdFromUrl(url);
    const info = await resolveMusicInfo('search', title, {
        timeoutMs: 800,
        ...options,
        metadataOnly: true,
        resolvers: {
            search: async (query, { json }) => {
                let songs;
                if (source === '163') {
                    const data = checkCode(await json('https://music.163.com/api/search/get', {
                        s: query,
                        type: '1',
                        limit: '20',
                        offset: '0'
                    }), source, 200);
                    songs = (Array.isArray(data.result?.songs) ? data.result.songs : []).map((song) => ({
                        title: song?.name,
                        singer: (Array.isArray(song?.artists) ? song.artists : [])
                            .map((artist) => artist?.name)
                            .filter((name) => typeof name === 'string' && name.trim())
                            .join(' / '),
                        ids: [song?.id]
                    }));
                }
                else if (source === 'kugou') {
                    const data = checkCode(await json('https://mobileservice.kugou.com/api/v3/search/song', {
                        keyword: query,
                        page: '1',
                        pagesize: '20',
                        showtype: '1'
                    }), source, 0);
                    if (data.status !== 1)
                        throw musicError('ERR_MUSIC_RESPONSE', source, '搜索接口返回失败');
                    songs = (Array.isArray(data.data?.info) ? data.data.info : []).map((song) => ({
                        title: song?.songname,
                        singer: typeof song?.singername === 'string' ? song.singername : '',
                        ids: [song?.hash]
                    }));
                }
                else {
                    const data = checkCode(await json('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
                        w: query,
                        p: '1',
                        n: '20',
                        format: 'json'
                    }), source, 0);
                    songs = (Array.isArray(data.data?.song?.list) ? data.data.song.list : []).map((song) => ({
                        title: song?.songname,
                        singer: (Array.isArray(song?.singer) ? song.singer : [])
                            .map((artist) => artist?.name)
                            .filter((name) => typeof name === 'string' && name.trim())
                            .join(' / '),
                        ids: [song?.songmid, song?.songid]
                    }));
                }
                const name = query.trim().normalize('NFKC').toLowerCase();
                const matches = songs.filter((song) => typeof song.title === 'string' &&
                    song.title.trim().normalize('NFKC').toLowerCase() === name);
                const linked = expected?.type === source
                    ? matches.find((song) => song.ids.some((id) => source === 'kugou'
                        ? String(id).toLowerCase() === expected.id.toLowerCase()
                        : sameId(id, expected.id)))
                    : undefined;
                const singers = new Set((linked ? [linked] : matches).map((song) => song.singer.trim()).filter(Boolean));
                return { title, url, singer: singers.size === 1 ? [...singers][0] : '' };
            }
        }
    });
    return info.singer ?? '';
};
export function registerMusicResolver(type, resolver) {
    if (typeof type !== 'string' || !type.trim() || typeof resolver !== 'function') {
        throw new TypeError('音乐来源名称必须是非空字符串，resolver 必须是函数');
    }
    const registration = { resolver };
    registeredResolvers.set(type, registration);
    return () => {
        if (registeredResolvers.get(type) === registration)
            registeredResolvers.delete(type);
    };
}
/**
 * 返回 { title, singer, url, audio, image }，歌手、音频和封面可为空。
 * 调用级 resolvers 优先于插件注册的解析器，其次使用内置来源。
 * 保留 ID 字符串，超时覆盖完整解析过程。
 */
export async function resolveMusicInfo(type, id, { fetchImpl = globalThis.fetch, timeoutMs = 8000, resolvers = {}, metadataOnly = false } = {}) {
    if (typeof type !== 'string')
        throw musicError('ERR_MUSIC_PLATFORM', type, '不支持的音乐平台');
    if (typeof fetchImpl !== 'function' ||
        !Number.isInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 2147483647 ||
        !resolvers ||
        typeof resolvers !== 'object' ||
        Array.isArray(resolvers)) {
        throw musicError('ERR_MUSIC_OPTIONS', type, 'fetchImpl、timeoutMs 或 resolvers 配置无效');
    }
    const override = Object.hasOwn(resolvers, type);
    const registration = registeredResolvers.get(type);
    if (!PLATFORMS.has(type) && !override && !registration) {
        throw musicError('ERR_MUSIC_PLATFORM', type, '未注册该音乐来源');
    }
    const resolver = override ? resolvers[type] : (registration?.resolver ?? DEFAULT_RESOLVERS[type]);
    if (typeof resolver !== 'function')
        throw musicError('ERR_MUSIC_OPTIONS', type, '平台 resolver 必须是函数');
    if (typeof id === 'number') {
        if (!Number.isSafeInteger(id) || id < 0)
            throw musicError('ERR_MUSIC_ID', type, '数字 ID 必须是非负安全整数');
        id = String(id);
    }
    const pattern = override || registration ? /\S/ : type === 'qq' || type === 'kugou' ? /^[a-z\d]+$/i : /^\d+$/;
    if (typeof id !== 'string' || !pattern.test(id))
        throw musicError('ERR_MUSIC_ID', type, 'ID 格式无效');
    const controller = new AbortController();
    const timeoutError = musicError('ERR_MUSIC_TIMEOUT', type, `解析超时 (${timeoutMs}ms)`);
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            controller.abort(timeoutError);
            reject(timeoutError);
        }, timeoutMs);
    });
    const boundedFetch = async (input, options = {}) => {
        controller.signal.throwIfAborted();
        const url = httpUrl(input instanceof URL ? input.href : input, type, 'request URL');
        const headers = new Headers(options.headers);
        if (!headers.has('User-Agent'))
            headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
        if (!headers.has('Referer'))
            headers.set('Referer', new URL(url).origin + '/');
        let response;
        try {
            response = await fetchImpl(url, {
                ...options,
                headers,
                signal: controller.signal,
                redirect: 'error'
            });
        }
        catch (cause) {
            if (controller.signal.aborted)
                throw controller.signal.reason;
            throw musicError('ERR_MUSIC_NETWORK', type, '音乐平台网络请求失败', cause);
        }
        controller.signal.throwIfAborted();
        if (response.url)
            httpUrl(response.url, type, 'response URL');
        return response;
    };
    const json = async (endpoint, params = {}, options = {}) => {
        const url = new URL(endpoint);
        for (const [key, value] of Object.entries(params))
            url.searchParams.set(key, value);
        const response = await boundedFetch(url, options);
        if (!response.ok) {
            const error = musicError('ERR_MUSIC_HTTP', type, `音乐平台 HTTP 请求失败 (${response.status})`);
            error.status = response.status;
            throw error;
        }
        try {
            const data = await response.json();
            controller.signal.throwIfAborted();
            return data;
        }
        catch (cause) {
            if (controller.signal.aborted)
                throw controller.signal.reason;
            throw musicError('ERR_MUSIC_RESPONSE', type, '音乐平台响应不是有效 JSON', cause);
        }
    };
    try {
        const work = Promise.resolve()
            .then(() => resolver(id, {
            type,
            fetchImpl: boundedFetch,
            signal: controller.signal,
            timeoutMs,
            json,
            metadataOnly
        }))
            .then((info) => validateInfo(metadataOnly ? { ...info, audio: '' } : info, type));
        return await Promise.race([work, timeout]);
    }
    finally {
        clearTimeout(timer);
        controller.abort();
    }
}
