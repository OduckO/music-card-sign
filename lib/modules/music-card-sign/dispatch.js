export async function runCommand(name, e) {
    if (name === 'update') {
        const { updatePlugin } = await import('./update.js');
        return updatePlugin(e);
    }
    const commands = await import('./commands.js');
    return commands[name](e);
}
