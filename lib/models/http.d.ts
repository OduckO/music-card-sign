import type { HttpOptions, HttpRequest, HttpSigner } from '../types/index.js';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import http from 'node:http';
type HostHandler = RequestHandler | ErrorRequestHandler | http.RequestListener;
interface RouterLayer {
    handle: HostHandler;
    route?: unknown;
    name?: string;
    slash?: boolean;
    regexp?: RegExp & {
        fast_slash?: boolean;
    };
}
export interface ExpressHost {
    use: (path: string, handler: HostHandler) => unknown;
    _router?: {
        stack: RouterLayer[];
    };
    router?: {
        stack: RouterLayer[];
    };
    quiet?: string[];
}
export declare function readBody(req: HttpRequest): Promise<unknown>;
export declare function createHandler(signer: HttpSigner, { apiKey, mounted, path: configuredPath, onLog }?: HttpOptions): (req: HttpRequest, res: http.ServerResponse) => Promise<void>;
export declare function mountService(app: ExpressHost, signer: HttpSigner, options?: HttpOptions): Promise<() => Promise<void>>;
export {};
