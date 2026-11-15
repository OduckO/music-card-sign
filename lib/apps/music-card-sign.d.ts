import type { CommandEvent, Config, MusicRequest, SignOptions } from '../types/index.js';
export declare function updateSettings(patch: Partial<Config>): Promise<void>;
export declare class MusicCardSign extends plugin<'message'> {
    constructor();
    init(): Promise<void>;
    status(e: CommandEvent): Promise<boolean>;
    toggle(e: CommandEvent): Promise<boolean>;
    setBot(e: CommandEvent): Promise<boolean>;
    signCard(e: Pick<CommandEvent, 'self_id'>, data: MusicRequest, reject: (message: string) => never, options?: SignOptions): Promise<string>;
    forwardCard(e: CommandEvent): Promise<boolean>;
    probe(e: CommandEvent): Promise<boolean>;
}
