import type { CommandEvent, MusicEvent, MusicRequest, SignOptions } from '../types/index.js';
export declare class MusicCardSign extends plugin<'message'> {
    constructor();
    init(): Promise<void>;
    onUnload(): Promise<void>;
    accept(e: MusicEvent): false | Promise<false | "return">;
    signCard(e: Pick<CommandEvent, 'self_id'>, data: MusicRequest, reject: (message: string) => never, options?: SignOptions): Promise<string>;
}
