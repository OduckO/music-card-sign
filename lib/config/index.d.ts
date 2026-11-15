import type { Config } from '../types/index.js';
declare class PluginConfig {
    config: Config;
    configSave: () => Promise<void>;
    initCfg(): Promise<this>;
}
declare const _default: PluginConfig;
export default _default;
