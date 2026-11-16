import type { CommandEvent } from '../../types/index.js';
import type * as Commands from './commands.js';
export declare function runCommand(name: keyof typeof Commands | 'update', e: CommandEvent): Promise<boolean>;
