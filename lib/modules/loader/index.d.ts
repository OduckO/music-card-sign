type PluginClass = new () => plugin;
export declare function loadApps(directory?: string, timeoutMs?: number): Promise<{
    apps: Record<string, PluginClass>;
    failedFiles: {
        file: string;
        error: unknown;
    }[];
}>;
export {};
