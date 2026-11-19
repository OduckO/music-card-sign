import type { CommandEvent } from '../../types/index.js';
export declare function toggle(e: CommandEvent): Promise<boolean>;
export declare function setBot(e: CommandEvent): Promise<boolean>;
export declare function setTarget(e: CommandEvent): Promise<boolean>;
export declare function setPlatform(e: CommandEvent): Promise<boolean>;
export declare function forwardCard(e: CommandEvent): Promise<boolean>;
export declare const setTimeout: (e: CommandEvent) => Promise<boolean>;
export declare function probe(e: CommandEvent): Promise<boolean>;
