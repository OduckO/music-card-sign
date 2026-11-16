import type { CommandEvent } from '@/types'
import type * as Commands from './commands'

export async function runCommand(name: keyof typeof Commands | 'update', e: CommandEvent) {
  if (name === 'update') {
    const { updatePlugin } = await import('./update')
    return updatePlugin(e)
  }
  const commands = await import('./commands')
  return commands[name](e)
}
