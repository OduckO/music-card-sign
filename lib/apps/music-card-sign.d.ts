import type { CommandEvent, MusicRequest, SignOptions } from '../types/index.js';
export declare class MusicCardSign extends plugin {
    constructor();
    init(): Promise<void>;
    status(e: CommandEvent): Promise<boolean>;
    toggle(e: CommandEvent): Promise<boolean>;
    setBot(e: CommandEvent): Promise<boolean>;
    signCard(e: Pick<CommandEvent, 'self_id'>, data: MusicRequest, reject: (message: string) => never, options?: SignOptions): Promise<string>;
    forwardCard(e: CommandEvent): Promise<boolean>;
    probe(e: CommandEvent): Promise<boolean>;
}
