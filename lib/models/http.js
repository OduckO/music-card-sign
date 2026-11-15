import { errorMessage, errorStatus } from '../utils/index.js';
import http from 'node:http';
import { cardText, MusicSignError } from './music-sign.js';
const signPaths = new Set(['/', '/music_card/card', '/api/music/sign', '/sign']);
const healthPaths = new Set(['/health', '/healthz']);
const bodyLimit = 64 * 1024;
function respond(res, status, data) {
    if (res.destroyed || res.writableEnded)
        return;
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });
    res.end(body);
}
async function readBody(req) {
    if (req.body !== undefined) {
        if (Buffer.byteLength(JSON.stringify(req.body)) > bodyLimit)
            throw new MusicSignError('请求体过大', 413);
        return req.body;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size <= bodyLimit)
            chunks.push(chunk);
    }
    if (size > bodyLimit)
        throw new MusicSignError('请求体过大', 413);
    const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!raw)
        return {};
    if (String(req.headers['content-type']).includes('application/x-www-form-urlencoded')) {
        return Object.fromEntries(new URLSearchParams(raw));
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new MusicSignError('请求体不是有效 JSON');
    }
}
export function createHandler(signer, { apiKey = '', mounted = false, path: configuredPath = '/music_card/card' } = {}) {
    return async (req, res) => {
        try {
            const url = new URL(req.url || '/', 'http://localhost');
            const path = url.pathname.replace(/\/+$/, '') || '/';
            if (healthPaths.has(path) && req.method === 'GET') {
                return respond(res, 200, { service: 'icqq-music-card-sign', ...signer.status?.() });
            }
            if (!(mounted ? path === '/' : path === configuredPath || signPaths.has(path))) {
                return respond(res, 404, { error: 'not found' });
            }
            if (apiKey && req.headers.authorization !== `Bearer ${apiKey}` && req.headers['x-api-key'] !== apiKey) {
                return respond(res, 401, { error: 'API 鉴权失败' });
            }
            if (req.method === 'GET' && !url.search) {
                return respond(res, 200, { service: 'icqq-music-card-sign', ...signer.status?.() });
            }
            if (!['GET', 'POST'].includes(req.method || ''))
                return respond(res, 405, { error: '使用 POST 或 GET' });
            const body = await readBody(req);
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                throw new MusicSignError('请求体必须是 JSON 对象');
            }
            const input = { ...Object.fromEntries(url.searchParams), ...body };
            const card = await signer.sign(input);
            respond(res, 200, cardText(card));
        }
        catch (error) {
            respond(res, errorStatus(error), { error: errorMessage(error) });
        }
    };
}
export async function mountService(app, signer, options = {}) {
    const path = options.path || '/music_card/card';
    if (!/^\/[\w/-]+$/.test(path) || path.endsWith('/'))
        throw new Error('签名 path 必须是不带结尾斜线的绝对路径');
    const handler = createHandler(signer, { ...options, mounted: true });
    const local = options.localPort ? http.createServer(createHandler(signer, options)) : null;
    if (local) {
        await new Promise((resolve, reject) => {
            local.once('error', reject);
            local.listen(options.localPort, '127.0.0.1', () => {
                local.removeListener('error', reject);
                resolve();
            });
        });
        local.unref();
    }
    try {
        app.use(path, handler);
    }
    catch (error) {
        local?.close();
        throw error;
    }
    const stack = app._router?.stack ?? app.router?.stack;
    if (stack) {
        const routeIndex = stack.findIndex(layer => layer.handle === handler);
        const fallbackIndex = stack.findIndex(layer => !layer.route && layer.name === '<anonymous>' &&
            (layer.slash || layer.regexp?.fast_slash) && layer.handle.length < 3);
        // Yunzai.run() 最后注册全局重定向；热加载路由须位于它之前，保留前置鉴权顺序。
        if (fallbackIndex !== -1 && routeIndex > fallbackIndex) {
            stack.splice(fallbackIndex, 0, stack.splice(routeIndex, 1)[0]);
        }
    }
    const quietAdded = Array.isArray(app.quiet) && !app.quiet.includes(path);
    if (quietAdded)
        app.quiet.push(path);
    return async () => {
        const stack = app._router?.stack ?? app.router?.stack;
        if (stack) {
            const index = stack.findIndex(layer => layer.handle === handler);
            if (index !== -1)
                stack.splice(index, 1);
        }
        if (quietAdded) {
            const index = app.quiet.indexOf(path);
            if (index !== -1)
                app.quiet.splice(index, 1);
        }
        if (local) {
            local.closeAllConnections?.();
            await new Promise(resolve => local.close(() => resolve()));
        }
    };
}
