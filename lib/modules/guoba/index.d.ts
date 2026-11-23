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
        schemas: import("trss-yunzai/guoba").Schema<"enabled" | "botId" | "targetId" | "commandBotMode" | "commandBotBlacklist" | "commandBotWhitelist" | "defaultPlatform" | "path" | "localPort" | "apiKey" | "platforms" | "testMusic" | "platformEntries" | "timeoutSeconds" | "targetFriend" | "testSong.type" | "testSong.id" | "testSong.platform" | "testSong.title" | "testSong.singer" | "testSong.url" | "testSong.audio" | "testSong.image" | "testSong.mode">[];
        getConfigData(): {
            timeoutSeconds: number;
            targetFriend: never[];
            platformEntries: import("../music-card-sign/config-form.js").PlatformRow[];
            testSong: import("../music-card-sign/config-form.js").MusicForm;
            platforms: string;
            testMusic: string;
            enabled: boolean;
            botId: string;
            targetId: string;
            commandBotMode: "off" | "blacklist" | "whitelist";
            commandBotBlacklist: string[];
            commandBotWhitelist: string[];
            defaultPlatform: string;
            path: string;
            localPort: number;
            apiKey: string;
        };
        setConfigData(data: Record<string, unknown>, { Result }: {
            Result: Pick<typeof GuobaResultType, "ok" | "error">;
        }): Promise<GuobaResultType<any>>;
    };
};
