import type { HttpOptions, HttpRequest, HttpSigner } from '../types/index.js';
import type { RequestHandler } from 'express';
import http from 'node:http';
interface RouterLayer {
    handle: RequestHandler | http.RequestListener;
    route?: unknown;
    name?: string;
    slash?: boolean;
    regexp?: {
        fast_slash?: boolean;
    };
}
export interface ExpressHost {
    use: (path: string, handler: http.RequestListener) => unknown;
    _router?: {
        stack: RouterLayer[];
    };
    router?: {
        stack: RouterLayer[];
    };
    quiet?: string[];
}
export declare function createHandler(signer: HttpSigner, { apiKey, mounted, path: configuredPath }?: HttpOptions): (req: HttpRequest, res: http.ServerResponse) => Promise<void>;
export declare function mountService(app: ExpressHost, signer: HttpSigner, options?: HttpOptions): Promise<() => Promise<void>>;
export {};
