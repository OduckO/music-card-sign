import type { CommandEvent } from '../../types/index.js';
import type * as Commands from './commands.js';
export declare function runCommand(name: keyof typeof Commands | 'update' | 'help' | 'status' | 'settings', e: CommandEvent): Promise<boolean>;
