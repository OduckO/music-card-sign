# 开发指南

[返回 README](../README.md) · [接口文档](api.md)

## 源码开发

需要 Node.js 24 和 pnpm 9。在合适的开发目录克隆 `main` 分支：

```sh
git clone -b main https://github.com/OduckO/music-card-sign.git
cd music-card-sign
pnpm install --ignore-workspace --frozen-lockfile
```

| 命令                    | 用途                                       |
| ----------------------- | ------------------------------------------ |
| `pnpm run typecheck`    | 严格检查 TS 类型                           |
| `pnpm run lint`         | 使用 Oxlint 检查源码、测试和入口           |
| `pnpm run lint:fix`     | 修复支持自动修复的代码规则                 |
| `pnpm run format`       | 使用 Oxfmt 统一格式                        |
| `pnpm run format:check` | 检查格式，不写入文件                       |
| `pnpm run build`        | 使用 `tsc && tsc-alias` 生成 JS 和类型声明 |
| `pnpm test`             | 构建后测试编译产物                         |

构建可独立进行；插件运行时由云崽加载，并使用宿主的配置工具和全局对象。

项目沿用 [Yunzai-Plugin-Example-TS](https://github.com/KaguyaJs/Yunzai-Plugin-Example-TS) 的入口、目录、配置和构建方式，TS 目录职责可对照 [云崽插件目录结构](https://yunzai-bot.com/dev/folder.html#ts-插件结构)。

```text
music-card-sign/
├── index.js                         # 云崽入口，加载 lib/index.js
├── src/
│   ├── index.ts                      # 导出 loadApps() 注册的应用
│   ├── dir.ts                        # 插件、应用和资源路径
│   ├── apps/music-card-sign.ts        # 主人命令、Handler 和服务生命周期
│   ├── config/index.ts               # 云崽配置工具与旧配置迁移
│   ├── models/                       # 签名、歌曲查询、精确缓存和 HTTP
│   ├── modules/loader/index.ts        # 加载编译后的应用
│   ├── types/                        # 配置和公开 API 类型
│   └── utils/                        # 错误信息处理
├── resources/config/config.yaml      # 默认配置
├── lib/                              # 构建生成的 JS 和类型声明
├── test/                             # 编译产物的离线测试
├── docs/                             # API 和开发指南
├── .github/workflows/build-push-lib.yml
├── .oxlintrc.json
├── .oxfmtrc.json
├── tsconfig.json
├── pnpm-lock.yaml
└── package.json
```

## 类型与代码规范

云崽全局对象、插件类和命令事件使用 [TRSS-Yunzai-Types](https://github.com/KaguyaJs/TRSS-Yunzai-Types) 的 `@kaguyajs/trss-yunzai-types`。沿用模板的 `@types/trss-yunzai` 包别名，锁文件当前解析为 1.3.3；代码中通过 `trss-yunzai` 引入类型。

TS 源码使用无扩展名导入。`tsc-alias` 将 `@/`、`~/` 别名和内部模块路径转换成 Node.js ESM 可执行的 `.js` 路径；宿主配置模块由 Node 在运行时解析。

[Oxlint](https://oxc.rs/docs/guide/usage/linter/config.html) 使用 `correctness`、`suspicious`、`perf` 规则组，并检查严格相等、`const` 和类型导入。源码中的静态导入、导出和字符串形式动态导入禁止使用 `.js` 扩展名。

[Oxfmt](https://oxc.rs/docs/guide/usage/formatter/config.html) 采用两空格、单引号、无分号、无尾逗号、100 列和 LF 换行。构建目录、运行数据、临时文件和锁文件不参与格式化。

## Handler 接入

其他插件可调用 Runtime Handler，取得音卡原文并发送：

```javascript
const raw = await e.runtime.handler.call('music.sign', e, {
  type: 'custom',
  title: '歌曲名',
  singer: '歌手',
  url: 'https://example.com/song',
  audio: 'https://example.com/audio.mp3',
  _platform: 'netease'
})
await e.reply({ type: 'json', data: raw })
```

账号按请求 `self_id`、配置 `botId`、当前事件 `self_id`、唯一在线 icqq 账号的顺序选择。生成账号与接收会话可不同，接收协议需要支持 JSON 卡片。

## 扩展 ID 查询

`registerMusicResolver(type, resolver)` 让插件用自己的 API 获取歌曲信息。`type` 是请求中的来源名称，解析器返回 `{ title, singer, url, audio, image }`：歌名、歌手、跳转地址和音频地址必需，封面可为空。

以下示例用于 JS 插件。导入注册函数：

```javascript
import { registerMusicResolver } from '../../music-card-sign/lib/models/music-info.js'
```

将注册逻辑放入现有插件的 `init()`。`myMusicApi` 代表该插件已有的 API 客户端，按实际结果映射字段：

```javascript
async init() {
  const install = () => registerMusicResolver('my-plugin', async (id, { signal }) => {
    const song = await myMusicApi.getSong(id, { signal })
    return {
      title: song.name,
      singer: song.artist,
      url: song.link,
      audio: song.playUrl,
      image: song.cover || ''
    }
  })
  let unregister = install()
  this.addCleanup(() => unregister(), () => { unregister = install() })
}
```

TS 插件导入类型时可使用无扩展名路径：

```typescript
import type { MusicResolver } from '../../music-card-sign/lib/types/music'
```

HTTP、Handler 和测试命令均可使用同一请求：

```json
{ "type": "my-plugin", "id": "track:00123" }
```

注册为 `qq`、`163` 等内置名称时，会改用开发者的查询 API。最近一次注册生效，旧注册的注销函数不会移除后来注册的解析器。卸载时调用注销函数，避免持有插件引用。

解析器接收 `(id, { type, signal, timeoutMs, fetchImpl, json })`。ID 字符串原样传入，格式由解析器自行解释。`json(url, params, options)` 和 `fetchImpl(url, options)` 沿用查询超时；使用自己的客户端时，将 `signal` 传给请求。解析结束后会取消剩余请求，并统一检查歌曲字段。

直接查询歌曲信息可调用同模块的 `resolveMusicInfo(type, id, options)`。`options.resolvers` 中的查询函数优先于已注册解析器，其次才使用内置来源。

ID 精确缓存命中时会跳过查询。更新歌曲 API 后，需要重新生成相同请求时，可删除对应缓存，或使用 `#音之测测 {请求JSON}`。

## 测试与资源释放

离线测试使用模拟 QQ 消息和本地 Express，覆盖匹配、完整 JSON、并发、精确缓存、ID 扩展、命令和配置迁移。接入账号后的回传检查使用 `#音之测测`。

并发重复请求共用一次查询和提交；相同账号、应用 ID 和歌曲内容的不同请求按顺序提交，其他歌曲仍可并行。任务完成后释放等待记录，账号最后一项请求结束后解绑监听器。关闭和重新开启服务会等待旧缓存写入完成。

## 自动编译与发布

`main` 保存 TS 源码，`lib/` 不提交到 `main`。每次推送 `main`，GitHub Actions 按模板检出云崽和插件，安装锁定依赖，运行类型、lint、格式检查及编译产物测试。

检查通过后，将 `package.json.files` 中的运行文件和文档发布到 `lib` 分支，同时上传 `music-card-sign-js` 产物。发布包移除开发依赖和开发脚本，JS 与类型声明一起保留。工作流也支持手动运行。
