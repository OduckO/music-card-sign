import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppsDir, PluginName } from '../../dir.js';
import { errorMessage } from '../../utils/index.js';
export async function loadApps() {
    logger.info(`[${PluginName}] 仅加载应用目录 ${AppsDir}`);
    const files = (await readdir(AppsDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => entry.name)
        .toSorted();
    const results = await Promise.allSettled(files.map(async (file) => {
        const started = performance.now();
        logger.info(`[${PluginName}] 应用 ${file} 开始导入`);
        try {
            const app = (await import(pathToFileURL(join(AppsDir, file)).href));
            logger.info(`[${PluginName}] 应用 ${file} 导入完成，${Math.round(performance.now() - started)} ms`);
            return app;
        }
        catch (error) {
            logger.error(`[${PluginName}] 应用 ${file} 导入失败：${errorMessage(error)}，${Math.round(performance.now() - started)} ms`, error);
            throw error;
        }
    }));
    const apps = {};
    for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
            if (files[index] === 'music-card-sign.js')
                throw result.reason;
            continue;
        }
        try {
            const entries = Object.entries(result.value).filter((entry) => typeof entry[1] === 'function' && entry[1].prototype instanceof plugin);
            if (!entries.length)
                throw new Error('未导出继承 plugin 的应用类');
            const duplicate = entries.find(([name]) => Object.hasOwn(apps, name));
            if (duplicate)
                throw new Error(`重复插件类：${duplicate[0]}`);
            Object.assign(apps, Object.fromEntries(entries));
        }
        catch (error) {
            logger.error(`[${PluginName}] 应用 ${files[index]} 加载失败：${errorMessage(error)}`, error);
            if (files[index] === 'music-card-sign.js')
                throw error;
        }
    }
    logger.info(`[${PluginName}] 已加载 ${Object.keys(apps).length} 个应用`);
    return { apps };
}
