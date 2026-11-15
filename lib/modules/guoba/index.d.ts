import type { Config } from '../../types/index.js';
import type { Result as GuobaResultType, Schemas } from 'trss-yunzai/guoba';
type FormConfig = Omit<Config, 'platforms' | 'testMusic'> & {
    platforms: string;
    testMusic: string;
};
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
        schemas: Schemas<FormConfig>;
        getConfigData(): {
            platforms: string;
            testMusic: string;
            enabled: boolean;
            botId: string;
            targetId: string;
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
export {};
