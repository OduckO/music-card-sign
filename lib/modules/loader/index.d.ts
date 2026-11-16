type PluginClass = new () => plugin;
export declare function loadApps(): Promise<{
    apps: Record<string, PluginClass>;
}>;
export {};
