import type { CommandEvent } from '../types/index.js';
export declare class MusicCardTest extends plugin<'message'> {
    constructor();
    probe(e: CommandEvent): Promise<boolean>;
    forwardCard(e: CommandEvent): Promise<boolean>;
}
