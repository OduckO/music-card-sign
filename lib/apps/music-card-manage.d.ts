import type { CommandEvent } from '../types/index.js';
export declare class MusicCardManage extends plugin<'message'> {
    constructor();
    help(e: CommandEvent): Promise<boolean>;
    status(e: CommandEvent): Promise<boolean>;
    toggle(e: CommandEvent): Promise<boolean>;
    setBot(e: CommandEvent): Promise<boolean>;
    setTarget(e: CommandEvent): Promise<boolean>;
    setPlatform(e: CommandEvent): Promise<boolean>;
    update(e: CommandEvent): Promise<boolean>;
}
