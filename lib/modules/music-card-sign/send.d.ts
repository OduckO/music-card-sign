import type { CommandEvent } from '../../types/index.js';
export declare function replyNotice(e: CommandEvent, message: string): Promise<void>;
export declare function adapterName(e: Pick<CommandEvent, 'bot' | 'self_id'>): string;
export declare function replyCard(e: CommandEvent, raw: string): Promise<void>;
