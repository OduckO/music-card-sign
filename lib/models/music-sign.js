import { errorMessage } from '../utils/index.js';
const platforms = {
    qq: {
        appid: 100497308,
        appname: 'com.tencent.qqmusic',
        appsign: 'cbd27cd7c861227d013a25b2d10f0799'
    },
    netease: {
        appid: 100495085,
        appname: 'com.netease.cloudmusic',
        appsign: 'da6b069da1e2982db3e386233f68d76d'
    },
    kuwo: {
        appid: 100243533,
        appname: 'cn.kuwo.player',
        appsign: 'bf9ff4ffb4c558a34ee3fd52c223ebf5'
    },
    kugou: {
        appid: 205141,
        appname: 'com.kugou.android',
        appsign: 'fe4a24d80fcf253a00676a808f62c2c6'
    },
    migu: {
        appid: 1101053067,
        appname: 'cmccwm.mobilemusic',
        appsign: '6cdc72a439cef99a3418d2a78aa28c73'
    },
    bilibili: {
        appid: 100951776,
        appname: 'tv.danmaku.bili',
        appsign: '7194d531cbe7960a22007b9f6bdaa38b'
    },
    '5sing': {
        appid: 200079,
        appname: 'com.sing.client',
        appsign: '3fa2b7951bbf704a052bd2364f3e3ee1'
    },
    bodian: {
        appid: 101904722,
        appname: 'cn.wenyu.bodian',
        appsign: '5380ca99d2bea3173b0b6e52cff44b45'
    },
    tim: {
        appid: 1105296740,
        appname: 'com.tencent.tim',
        appsign: '775e696d09856872fdd8ab4f3f06b1e0'
    },
    yuanshen: {
        appid: 1110976923,
        appname: 'com.miHoYo.Yuanshen',
        appsign: '5583e6a15a9cfbe6af9c945c5b8b1a4b'
    }
};
const aliases = { 163: 'netease', custom: 'qq' };
const httpsDomains = [
    'gtimg.cn',
    'qq.com',
    'music.126.net',
    'kuwo.cn',
    'kugou.com',
    'kgimg.com',
    'migu.cn',
    'hdslb.com',
    'bilibili.com'
];
const rawCards = new WeakMap();
export function cardText(card) {
    return rawCards.get(card) ?? JSON.stringify(card);
}
export class MusicSignError extends Error {
    status;
    details;
    constructor(message, status = 400, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
function unwrap(input) {
    if (typeof input === 'string') {
        try {
            input = JSON.parse(input);
        }
        catch {
            throw new MusicSignError('请求必须是 JSON 对象');
        }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new MusicSignError('请求必须是 JSON 对象');
    }
    const data = input;
    if (data.data || data.params)
        return { ...unwrap(data.data || data.params), ...data };
    return data;
}
function text(value, field) {
    if (value === undefined || value === null)
        return '';
    if (!['string', 'number'].includes(typeof value))
        throw new MusicSignError(`${field} 必须是字符串`);
    const result = String(value).trim();
    if (result.length > 8192)
        throw new MusicSignError(`${field} 过长`);
    return result;
}
function webUrl(value, field, required = false) {
    const result = text(value, field);
    if (!result && !required)
        return '';
    try {
        const url = new URL(result);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            throw new Error();
        if (field !== 'audio' &&
            url.protocol === 'http:' &&
            httpsDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
            url.protocol = 'https:';
            return url.href;
        }
    }
    catch {
        throw new MusicSignError(`${field} 必须是 http(s) URL`);
    }
    return result;
}
export function selectPlatform(data, customPlatforms) {
    const selected = data._platform ?? data.platform ?? data.source ?? data.type ?? 'qq';
    let platform;
    if (selected && typeof selected === 'object' && !Array.isArray(selected))
        platform = selected;
    else {
        const name = text(selected, '_platform').toLowerCase();
        platform = customPlatforms[aliases[name] || name] ?? platforms[aliases[name] || name];
        if (!platform &&
            data.id !== undefined &&
            data._platform === undefined &&
            data.platform === undefined &&
            data.source === undefined)
            platform = platforms.qq;
        if (!platform)
            throw new MusicSignError(`未知音卡平台：${name}`);
    }
    const appid = Number(platform.appid);
    if (!Number.isSafeInteger(appid) || appid <= 0)
        throw new MusicSignError('平台 appid 必须是正整数');
    const appname = text(platform.appname, 'appname');
    const appsign = text(platform.appsign ?? platform.app_sign, 'appsign');
    if (!/^[\w.]+$/.test(appname))
        throw new MusicSignError('平台 appname 必须是应用包名');
    if (appsign && !/^[a-f\d]{32}$/i.test(appsign))
        throw new MusicSignError('平台 appsign 必须为空或 32 位十六进制应用 hash');
    return { appid, appname, appsign };
}
export function normalizeRequest(input, customPlatforms = {}) {
    const data = unwrap(input);
    const platform = selectPlatform(data, customPlatforms);
    const title = text(data.title ?? data.song ?? data.name, 'title');
    if (!title)
        throw new MusicSignError('缺少歌曲 title');
    return {
        selfId: text(data.self_id ?? data.bot_id, 'self_id'),
        platform,
        content: {
            type: 'share',
            title,
            summary: text(data.singer ?? data.artist ?? data.content ?? data.desc, 'singer'),
            content: text(data.prompt, 'prompt') || `[分享]${title}`,
            url: webUrl(data.jump ?? data.jumpUrl ?? data.url ?? data.link, 'url', true),
            audio: webUrl(data.audio ?? data.voice ?? data.musicUrl, 'audio', true),
            image: webUrl(data.image ?? data.cover ?? data.pic, 'image')
        }
    };
}
function exactJSON(value) {
    try {
        return JSON.stringify(value, (key, item) => {
            if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof item) ||
                (typeof item === 'number' && !Number.isFinite(item))) {
                throw new Error('请求只支持 JSON 字段值');
            }
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                return Object.fromEntries(Object.keys(item)
                    .toSorted()
                    .map((name) => [name, item[name]]));
            }
            return item;
        });
    }
    catch {
        throw new MusicSignError('请求必须是可序列化的 JSON 对象');
    }
}
function receivedCards(event) {
    const result = [];
    for (const elem of Array.isArray(event.message) ? event.message : []) {
        if (elem?.type !== 'json')
            continue;
        try {
            const raw = elem.data;
            const card = (typeof raw === 'string' ? JSON.parse(raw) : raw);
            if (card?.view === 'music' && card.meta?.music) {
                if (typeof raw === 'string')
                    rawCards.set(card, raw);
                result.push(card);
            }
        }
        catch {
            /* 非音乐或无法解析的 JSON 不影响其它等待项。 */
        }
    }
    return result;
}
function mismatchFields(card, request) {
    const music = card.meta.music;
    let extra = card.extra;
    if (typeof extra === 'string') {
        try {
            extra = JSON.parse(extra);
        }
        catch {
            extra = null;
        }
    }
    const content = request.content;
    const expected = {
        appid: request.platform.appid,
        prompt: content.content,
        title: content.title,
        desc: content.summary,
        jumpUrl: content.url,
        musicUrl: content.audio
    };
    const actual = {
        appid: Number(music.appid ?? (typeof extra === 'object' ? extra?.appid : undefined)),
        prompt: String(card.prompt ?? ''),
        title: String(music.title ?? ''),
        desc: String(music.desc ?? ''),
        jumpUrl: String(music.jumpUrl ?? ''),
        musicUrl: String(music.musicUrl ?? '')
    };
    // QQ 会把封面转存为 preview，不能用它判断回包是否属于原请求。
    return Object.keys(expected).filter((field) => actual[field] !== expected[field]);
}
function nativeBot(bot) {
    const sdk = ('sdk' in bot ? bot.sdk : bot);
    const online = typeof sdk?.isOnline === 'function' ? sdk.isOnline() : sdk?.online === true;
    return online && sdk && typeof sdk.pickFriend === 'function' && typeof sdk.on === 'function'
        ? sdk
        : null;
}
export class MusicSigner {
    getBots;
    botId;
    targetId;
    timeoutMs;
    customPlatforms;
    resolveMusic;
    cache;
    onCacheError;
    onLog;
    sequence = 0;
    pending = new Map();
    inflight = new Map();
    submissions = new Map();
    listeners = new Map();
    closed = false;
    constructor({ getBots, botId = '', targetId = '', timeoutMs = 15000, customPlatforms = {}, resolveMusic, cache, onCacheError, onLog }) {
        if (typeof getBots !== 'function')
            throw new TypeError('getBots 必须是函数');
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
            throw new TypeError('timeoutMs 必须大于 0');
        const target = String(targetId).trim();
        if (target && (!/^[1-9]\d*$/.test(target) || !Number.isSafeInteger(Number(target))))
            throw new TypeError('联系人必须是有效的正整数 QQ 号，或留空');
        this.getBots = getBots;
        this.botId = botId;
        this.targetId = target;
        this.timeoutMs = timeoutMs;
        this.customPlatforms = customPlatforms;
        this.resolveMusic = resolveMusic;
        this.cache = cache;
        this.onCacheError = onCacheError;
        this.onLog = onLog;
    }
    bots() {
        return [
            ...new Set(this.getBots()
                .map(nativeBot)
                .filter((bot) => bot !== null))
        ];
    }
    async sign(input, { forceFresh = false } = {}) {
        const trace = `请求=${++this.sequence}`;
        this.onLog?.('info', `${trace} 收到签名请求，强制重新签名=${forceFresh}`);
        if (this.closed)
            throw new MusicSignError('音卡签名服务已关闭', 503);
        const data = JSON.parse(exactJSON(unwrap(input)));
        const bots = this.bots();
        const id = text(data.self_id ?? data.bot_id, 'self_id') || String(this.botId || '');
        if (!id && bots.length > 1)
            throw new MusicSignError('有多个在线 icqq 账号，请指定 self_id 或配置 botId');
        const bot = id ? bots.find((candidate) => String(candidate.uin) === id) : bots[0];
        if (!bot) {
            this.onLog?.('error', `${trace} 选择账号失败，指定 Bot=${id || '自动'}，在线 icqq=${bots.map((candidate) => candidate.uin).join('、') || '无'}`);
            throw new MusicSignError('未找到指定的在线 icqq 账号，请先接入 ICQQ-Plugin', 503);
        }
        const context = `${trace} Bot=${bot.uin} 接收 QQ=${this.targetId || bot.uin}`;
        this.onLog?.('info', `${context} 已选择签名账号`);
        const platform = selectPlatform(data, this.customPlatforms);
        const identity = exactJSON([String(bot.uin), platform, data]);
        const key = (forceFresh ? 'fresh:' : 'cached:') + identity;
        if (this.inflight.has(key))
            return this.inflight.get(key);
        const operation = this.signRequest(bot, data, platform, identity, key, forceFresh, context);
        this.inflight.set(key, operation);
        try {
            return await operation;
        }
        catch (error) {
            this.onLog?.('error', `${context} 签名失败：${errorMessage(error)} 请求体=${JSON.stringify(data)}`);
            throw error;
        }
        finally {
            if (this.inflight.get(key) === operation)
                this.inflight.delete(key);
        }
    }
    async signRequest(bot, data, platform, identity, key, forceFresh, context) {
        if (this.cache && !forceFresh) {
            try {
                const record = await this.cache.get(identity);
                if (record) {
                    const [card] = receivedCards({ message: [{ type: 'json', data: record.raw }] });
                    if (!card ||
                        mismatchFields(card, record.request).length > 0 ||
                        exactJSON(record.request.platform) !== exactJSON(platform)) {
                        throw new Error('音卡缓存正文与保存的请求不匹配');
                    }
                    if (this.closed)
                        throw new MusicSignError('音卡签名服务已关闭', 503);
                    this.onLog?.('info', `${context} 精确缓存命中，复用完整 JSON`);
                    return card;
                }
            }
            catch (error) {
                if (this.closed)
                    throw error;
                this.onCacheError?.(error);
            }
        }
        if (this.closed)
            throw new MusicSignError('音卡签名服务已关闭', 503);
        if (data.id !== undefined && !(data.title ?? data.song ?? data.name)) {
            this.onLog?.('info', `${context} 查询歌曲信息，来源=${data.type || 'qq'} ID=${data.id}`);
            const resolve = this.resolveMusic ?? (await import('./music-info.js')).resolveMusicInfo;
            const info = await resolve(data.type || 'qq', data.id, { timeoutMs: this.timeoutMs });
            data = { ...info, ...data };
        }
        // 使用开始时的平台配置，避免异步歌曲查询期间配置改变。
        const request = normalizeRequest({ ...data, _platform: platform });
        if (this.closed)
            throw new MusicSignError('音卡签名服务已关闭', 503);
        const card = await this.submit(bot, request, key, context);
        if (this.cache) {
            try {
                await this.cache.set(identity, cardText(card), request);
                this.onLog?.('info', `${context} 完整 JSON 已保存缓存`);
            }
            catch (error) {
                this.onCacheError?.(error);
            }
        }
        return card;
    }
    async submit(bot, request, key, context) {
        // 仅凭这些字段识别本次回包；其余字段不同的请求需串行，才能明确报告错误。
        const content = request.content;
        const group = exactJSON([
            String(bot.uin),
            request.platform.appid,
            content.title,
            content.content,
            content.url
        ]);
        const previous = this.submissions.get(group) ?? Promise.resolve();
        const operation = previous
            .catch(() => { })
            .then(() => {
            if (this.closed)
                throw new MusicSignError('音卡签名服务已关闭', 503);
            return this.send(bot, request, key, context);
        });
        this.submissions.set(group, operation);
        try {
            return await operation;
        }
        finally {
            if (this.submissions.get(group) === operation)
                this.submissions.delete(group);
        }
    }
    send(bot, request, key, context) {
        const targetId = Number(this.targetId || bot.uin);
        const started = performance.now();
        const subscription = this.listen(bot);
        const { promise, resolve, reject } = Promise.withResolvers();
        const item = {
            request,
            started: Math.floor(Date.now() / 1000),
            finish: (error, card) => {
                if (this.pending.get(key) !== item)
                    return;
                clearTimeout(item.timer);
                this.pending.delete(key);
                subscription.items.delete(item);
                if (!subscription.items.size)
                    this.unlisten(bot);
                if (error) {
                    this.onLog?.('error', `${context} 回传失败（${Math.round(performance.now() - started)} ms）：${error.message}`);
                    reject(error);
                }
                else {
                    this.onLog?.('info', `${context} 回传匹配，收到完整 JSON，${Math.round(performance.now() - started)} ms`);
                    resolve(card);
                }
            }
        };
        item.timer = setTimeout(() => item.finish(new MusicSignError(`等待 Bot=${bot.uin} 发给接收 QQ=${targetId} 的音卡 JSON 超时`, 504)), this.timeoutMs);
        this.pending.set(key, item);
        subscription.items.add(item);
        this.onLog?.('info', `${context} 监听 message.private / sync.message，等待发送同步 JSON ${this.timeoutMs} ms`);
        Promise.resolve()
            .then(() => {
            if (this.closed || this.pending.get(key) !== item)
                return;
            const friend = bot.pickFriend(targetId);
            if (typeof friend?.share !== 'function')
                throw new MusicSignError('该账号没有原生 icqq share 能力', 503);
            this.onLog?.('info', `${context} 提交分享，appid=${request.platform.appid}，歌曲=${request.content.title}`);
            return friend.share(request.content, request.platform);
        })
            .catch((error) => item.finish(new MusicSignError(`音卡提交失败：${errorMessage(error)}`, 502)));
        return promise;
    }
    unlisten(bot) {
        const subscription = this.listeners.get(bot);
        if (!subscription)
            return;
        this.listeners.delete(bot);
        for (const dispose of subscription.disposers)
            dispose();
    }
    listen(bot) {
        if (this.listeners.has(bot))
            return this.listeners.get(bot);
        const targetId = this.targetId || String(bot.uin);
        const subscription = {
            items: new Set(),
            disposers: [],
            listener: (event) => {
                if (event.group_id || (event.message_type && event.message_type !== 'private'))
                    return;
                if (event.self_id !== undefined && String(event.self_id) !== String(bot.uin))
                    return;
                const from = event.from_id ?? event.user_id ?? event.sender?.user_id;
                if (String(from) !== String(bot.uin) || String(event.to_id) !== targetId)
                    return;
                for (const card of receivedCards(event)) {
                    this.onLog?.('info', `Bot=${bot.uin} 接收 QQ=${targetId} 捕获发送音卡 JSON，appid=${card.meta.music.appid ?? '未知'}，歌曲=${card.meta.music.title ?? '未知'}`);
                    for (const item of subscription.items) {
                        if (event.time && event.time < item.started)
                            continue;
                        const fields = mismatchFields(card, item.request);
                        if (!fields.length)
                            item.finish(null, card);
                        else if (!fields.some((field) => ['appid', 'prompt', 'title', 'jumpUrl'].includes(field)))
                            item.finish(new MusicSignError(`音卡回传字段不匹配：${fields.join('、')}`, 502, { fields }));
                        else
                            this.onLog?.('warn', `Bot=${bot.uin} 忽略其他音卡回包，未匹配字段=${fields.join('、')}，等待歌曲=${item.request.content.title} appid=${item.request.platform.appid}`);
                    }
                }
            }
        };
        try {
            for (const event of ['message.private', 'sync.message']) {
                const dispose = bot.on(event, subscription.listener);
                // icqq 的 triptrap 返回取消函数；旧 EventEmitter 按 listener 单独移除。
                if (typeof dispose === 'function')
                    subscription.disposers.push(() => dispose());
                else {
                    const remove = bot.removeListener;
                    if (typeof remove !== 'function')
                        throw new MusicSignError('icqq SDK 未提供取消监听能力', 503);
                    subscription.disposers.push(() => remove.call(bot, event, subscription.listener));
                }
            }
        }
        catch (error) {
            for (const dispose of subscription.disposers)
                dispose();
            throw error;
        }
        this.listeners.set(bot, subscription);
        return subscription;
    }
    status() {
        return {
            enabled: !this.closed,
            bots: this.bots().map((bot) => String(bot.uin)),
            pending: this.pending.size,
            targetId: this.targetId
        };
    }
    async close() {
        this.closed = true;
        for (const item of this.pending.values())
            item.finish(new MusicSignError('音卡签名服务已关闭', 503));
        for (const bot of this.listeners.keys())
            this.unlisten(bot);
        await Promise.allSettled(this.inflight.values());
        this.inflight.clear();
        this.submissions.clear();
    }
}
