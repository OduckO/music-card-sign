import type { CommandEvent, MusicEvent, MusicRequest, SignOptions } from '../types/index.js';
export declare class MusicCardSign extends plugin<'message'> {
    constructor();
    init(): Promise<void>;
    onUnload(): Promise<void>;
    accept(e: MusicEvent): false | "return";
    help(e: CommandEvent): Promise<boolean>;
    status(e: CommandEvent): Promise<boolean>;
    toggle(e: CommandEvent): Promise<boolean>;
    setBot(e: CommandEvent): Promise<boolean>;
    setTarget(e: CommandEvent): Promise<boolean>;
    setPlatform(e: CommandEvent): Promise<boolean>;
    signCard(e: Pick<CommandEvent, 'self_id'>, data: MusicRequest, reject: (message: string) => never, options?: SignOptions): Promise<string>;
    forwardCard(e: CommandEvent): Promise<boolean>;
    probe(e: CommandEvent): Promise<boolean>;
    update(e: CommandEvent): Promise<boolean>;
}
