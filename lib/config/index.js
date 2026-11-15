import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import makeConfig from '../../../../lib/plugins/config.js';
import { Path, PluginName, PluginPath, ResPath } from '../dir.js';
import { errorCode } from '../utils/index.js';
class PluginConfig {
    config;
    configSave;
    async initCfg() {
        const defaults = YAML.parse(await fs.readFile(path.join(ResPath, 'config/config.yaml'), 'utf8'));
        const target = path.join(Path, 'config', `${PluginName}.yaml`);
        // 旧 JSON 只在 YAML 尚不存在时迁移，旧文件留在原处。
        try {
            await fs.access(target);
        }
        catch (error) {
            if (errorCode(error) !== 'ENOENT')
                throw error;
            try {
                const legacy = JSON.parse(await fs.readFile(path.join(PluginPath, 'config/config/config.json'), 'utf8'));
                Object.assign(defaults, legacy);
                await fs.mkdir(path.dirname(target), { recursive: true });
                await fs.writeFile(target, YAML.stringify(defaults), { flag: 'wx' });
            }
            catch (error) {
                if (errorCode(error) !== 'ENOENT' && errorCode(error) !== 'EEXIST')
                    throw error;
            }
        }
        const result = await makeConfig(PluginName, defaults, {}, { watch: false });
        this.config = result.config;
        this.configSave = result.configSave;
        if (!Number.isInteger(this.config.localPort) || this.config.localPort < 0 || this.config.localPort > 65535) {
            throw new Error('localPort 必须是 0 或有效端口号');
        }
        return this;
    }
}
export default await new PluginConfig().initCfg();
