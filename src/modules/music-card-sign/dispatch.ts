import type { CommandEvent } from '@/types'
import type * as Commands from './commands'

export async function runCommand(
  name: keyof typeof Commands | 'update' | 'help' | 'status' | 'settings',
  e: CommandEvent
) {
  if (name === 'help') {
    const { help } = await import('./help')
    return help(e)
  }
  if (name === 'update') {
    const { updatePlugin } = await import('./update')
    return updatePlugin(e)
  }
  if (name === 'status' || name === 'settings') {
    const { overview } = await import('./overview')
    return overview(e)
  }
  const commands = await import('./commands')
  return commands[name](e)
}
