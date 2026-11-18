export async function runCommand(name, e) {
    if (name === 'help') {
        const { help } = await import('./help.js');
        return help(e);
    }
    if (name === 'update') {
        const { updatePlugin } = await import('./update.js');
        return updatePlugin(e);
    }
    if (name === 'status') {
        const { overview } = await import('./overview.js');
        return overview(e);
    }
    const commands = await import('./commands.js');
    return commands[name](e);
}
