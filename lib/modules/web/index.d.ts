import type { RequestHandler } from 'express';
export interface PageContext {
    basePath?: string;
    registerPage: (descriptor: {
        id: string;
        title: string;
        icon: string;
        src: string;
        style: string;
        script: string;
        priority: number;
    }) => unknown;
    registerApi: (method: 'get' | 'post', route: string, handler: RequestHandler) => unknown;
}
export declare function init(ctx: PageContext): void;
