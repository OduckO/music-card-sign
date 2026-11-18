import type { Result as GuobaResultType } from 'trss-yunzai/guoba';
export declare function supportGuoba(): {
    pluginInfo: {
        name: string;
        title: string;
        description: string;
        author: string;
        authorLink: string;
        link: string;
        isV3: true;
        isV2: false;
        showInMenu: "auto";
        icon: string;
    };
    configInfo: {
        schemas: import("trss-yunzai/guoba").Schema<"timeoutMs" | "botId" | "targetId" | "defaultPlatform" | "apiKey" | "path" | "enabled" | "localPort" | "platforms" | "testMusic" | "platformEntries" | "testSong" | "targetFriend">[];
        getConfigData(): {
            targetFriend: never[];
            platformEntries: import("../music-card-sign/config-form.js").PlatformRow[];
            testSong: import("../music-card-sign/config-form.js").MusicForm;
            platforms: string;
            testMusic: string;
            enabled: boolean;
            botId: string;
            targetId: string;
            defaultPlatform: string;
            path: string;
            timeoutMs: number;
            localPort: number;
            apiKey: string;
        };
        setConfigData(data: Record<string, unknown>, { Result }: {
            Result: Pick<typeof GuobaResultType, "ok" | "error">;
        }): Promise<GuobaResultType<any>>;
    };
};
