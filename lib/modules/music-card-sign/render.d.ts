import type { CommandEvent } from '../../types/index.js';
export declare function replyTemplate(e: Pick<CommandEvent, 'reply'>, route: 'music/help' | 'music/overview', data: unknown, fallback: string): Promise<boolean>;
