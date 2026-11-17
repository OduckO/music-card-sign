# 开发指南

[返回 README](../README.md) · [接口文档](api.md)

已有云崽插件要调用音卡服务，先看 [Handler 接入](#handler-接入)；要用自己的 API 查询歌曲 ID，按 [扩展 ID 查询](#扩展-id-查询) 接入。修改音卡插件本身时，再看源码目录、类型规范和构建命令。

## 源码开发

需要 Node.js 24 和 pnpm 9。在合适的开发目录克隆 `main` 分支：

```sh
git clone -b main https://github.com/OduckO/music-card-sign.git
cd music-card-sign
pnpm install --ignore-workspace --frozen-lockfile
```

| 命令                    | 用途                                       |
| ----------------------- | ------------------------------------------ |
| `pnpm run typecheck`    | 严格检查业务源码及 TS 测试的类型           |
| `pnpm run lint`         | 使用 Oxlint 检查源码、测试和入口           |
| `pnpm run lint:fix`     | 修复支持自动修复的代码规则                 |
| `pnpm run format`       | 使用 Oxfmt 统一格式                        |
| `pnpm run format:check` | 检查格式，不写入文件                       |
| `pnpm run build`        | 使用 `tsc && tsc-alias` 生成 JS 和类型声明 |
| `pnpm run build:test`   | 将源码和 TS 测试编译到临时目录             |
| `pnpm test`             | 构建插件与测试，再执行测试 JS              |

构建可独立进行；插件运行时由云崽加载，并使用宿主的配置工具和全局对象。

项目沿用 [Yunzai-Plugin-Example-TS](https://github.com/KaguyaJs/Yunzai-Plugin-Example-TS) 的入口、目录、配置和构建方式，TS 目录职责可对照 [云崽插件目录结构](https://yunzai-bot.com/dev/folder.html#ts-插件结构)。

```text
music-card-sign/
├── index.js                         # 云崽入口，加载 lib/index.js
├── guoba.support.js                 # 锅巴入口，加载编译后的配置模块
├── src/
│   ├── index.ts                      # 自动加载 apps 并导出给云崽
│   ├── dir.ts                        # 插件、应用和资源路径
│   ├── apps/
│   │   ├── music-card-sign.ts         # 服务生命周期、回包识别与签名 Handler
│   │   ├── music-card-test.ts         # 音之测测与签名发卡指令
│   │   └── music-card-manage.ts       # 帮助、设置、服务开关与更新指令
│   ├── config/index.ts               # 云崽配置工具与旧配置迁移
│   ├── models/                       # 签名、歌曲查询、精确缓存和 HTTP
│   ├── modules/loader/index.ts        # 同层应用自动发现与逐文件错误处理
│   ├── modules/guoba/index.ts         # 锅巴表单、校验和配置保存
│   ├── modules/music-card-sign/
│   │   ├── service.ts                # 服务生命周期、配置保存和签名调用
│   │   ├── dispatch.ts               # 按需加载并执行命令
│   │   ├── commands.ts               # 命令解析和音之测测
│   │   ├── send.ts                   # 按会话适配器发送完整音卡 JSON
│   │   └── update.ts                 # 调用云崽本体更新器
│   ├── types/                        # 配置和公开 API 类型
│   └── utils/                        # 错误信息处理
├── resources/config/config.yaml      # 默认配置
├── lib/                              # 构建生成的 JS 和类型声明
├── test/                             # .test.ts 测试及 helpers/ 夹具
├── docs/                             # API 和开发指南
├── .github/workflows/build-push-lib.yml
├── .oxlintrc.json
├── .oxfmtrc.json
├── tsconfig.json
├── tsconfig.test.json
├── pnpm-lock.yaml
└── package.json
```

应用按功能拆分为独立的 `plugin` 子类，规则和事件入口放在 `src/apps/`，业务逻辑复用 `src/modules/`。服务模块在 `init()` 中动态导入；测试和管理应用静态导入轻量的 `runCommand` 入口，由 `dispatch.ts` 在执行指令时加载命令或更新模块。`MusicCardSign` 持有服务初始化、清理和 `music.sign` Handler；测试、发卡与管理应用共用服务，不重复挂载 HTTP 或监听器。

签名应用的 `accept` 同步跳过群聊、非私聊和其他用户消息，只对可能属于签名 Bot 的私聊回包调用服务检查。SDK 监听按需注册，回包匹配成功或字段错误时立即结束等待并释放监听；完整 JSON 返回后，缓存在后台写入。

`src/index.ts` 调用加载模块，自动扫描 `lib/apps/` 当前层的 JS，并行导入后按文件名顺序汇总 `apps`，交给云崽本体实例化并注册。单个文件导入失败会记录文件名和原始错误；签名服务应用失败会继续抛出错误。加载器不递归扫描，也不另设加载超时，加载超时由本体管理。

新增应用时，在 `src/apps/` 添加 TS 文件并导出命名的 `plugin` 子类，构建后自动加载，无需修改入口。类名须唯一；新增应用只声明自己的命令，不要重复初始化签名服务。写法可参考 [DF 插件的应用目录](https://github.com/KaguyaJs/Yunzai-DF-Plugin/tree/dev/src/apps)。

第三方 ID 查询扩展放在自己的插件或 `plugins/example/`，由云崽本体加载；不要复制到音卡的 `lib/apps/`。

## 类型与代码规范

云崽全局对象、插件类和命令事件使用 [TRSS-Yunzai-Types](https://github.com/KaguyaJs/TRSS-Yunzai-Types) 的 `@kaguyajs/trss-yunzai-types`。沿用模板的 `@types/trss-yunzai` 包别名，锁文件当前解析为 1.3.3；代码中通过 `trss-yunzai` 引入类型。

TS 源码使用无扩展名导入。`tsc-alias` 将 `@/`、`~/` 别名和内部模块路径转换成 Node.js ESM 可执行的 `.js` 路径；宿主配置模块由 Node 在运行时解析。

锅巴模块使用同一类型包的 `trss-yunzai/guoba`，入口和表单方式参照 [DF 插件 dev 分支](https://github.com/KaguyaJs/Yunzai-DF-Plugin/tree/dev)。根目录的两个 JS 文件是云崽和锅巴的加载入口，业务与配置实现位于 TS 模块中。

更新指令同样参考 DF 插件，按实际插件目录名调用宿主的 `plugins/other/update`。模块由 Node 在执行指令时解析，转交独立的事件对象，保留原指令和会话；更新互斥、Git 操作、依赖更新和重启沿用本体实现。JiuLi 提供该更新器的兼容入口。

[Oxlint](https://oxc.rs/docs/guide/usage/linter/config.html) 使用 `correctness`、`suspicious`、`perf` 规则组，并检查严格相等、`const` 和类型导入。源码中的静态导入、导出和字符串形式动态导入禁止使用 `.js` 扩展名。

[Oxfmt](https://oxc.rs/docs/guide/usage/formatter/config.html) 采用两空格、单引号、无分号、无尾逗号、100 列和 LF 换行。构建目录、运行数据、临时文件和锁文件不参与格式化。

## Handler 接入

在自己的插件命令中调用 `music.sign`，得到已签名的音卡 JSON 字符串，再发送到当前会话。Handler 负责生成音卡，`replyCard()` 负责按当前会话适配器发卡。

下面示例放在 `plugins/my-plugin/src/models/send-music.ts`，两个插件目录并列：

```typescript
import type { CustomEvent } from 'trss-yunzai'
import { replyCard } from '../../../music-card-sign/lib/modules/music-card-sign/send'

export async function sendMusicCard(e: CustomEvent) {
  const raw = await e.runtime.handler.call('music.sign', e, {
    type: 'custom',
    title: '歌曲名',
    singer: '歌手',
    url: 'https://example.com/song',
    audio: 'https://example.com/audio.mp3',
    _platform: 'default'
  })
  if (typeof raw !== 'string' || !raw) {
    throw new Error('音卡 Handler 未返回 JSON，请确认音卡插件已加载并启用')
  }
  await replyCard(e, raw)
}
```

将示例地址换成实际歌曲地址，在已有命令处理函数中调用 `await sendMusicCard(e)`。签名、回传和发送错误会向调用方抛出，由自己的插件捕获并回复。音卡插件未加载或 Handler 没有返回值时，示例会给出明确错误。

直接提交歌曲信息时，`audio` 可省略、为空字符串或 `null`；非空值须为 HTTP(S) 地址。请求类型 `MusicRequest` 接受这些写法，分享提交时空音频使用空字符串。

自定义来源注册后，可把歌曲字段替换为 `{ type: 'my-plugin', id: 'track:00123', _platform: 'default' }`，其余调用方式相同。

### 账号、平台与发送目标

账号按请求 `self_id` / `bot_id`、配置 `botId`、当前 ICQQ 事件账号、唯一在线 icqq 账号的顺序选择。OneBot v11 会话账号不会覆盖签名账号。

音卡平台按 `_platform`、`platform`、`source`、请求跳转链接、配置 `defaultPlatform` 的顺序选择。只识别跳转地址，`audio` 不参与。初始默认平台是 `default`（appid `102021671`，包名和签名为空）；命令和锅巴修改默认平台后，Handler 同时生效。`type` 用于 ID 查询来源，完整规则见 [自定义平台](api.md#自定义平台)。

扩展平台的 `PlatformInput` 只要求 `appid`，`appname`、`appsign` 和兼容字段 `app_sign` 可省略或为空；提交时省略的字段使用空字符串。

分享目标使用配置的 `targetId`，为空时使用选中的签名账号。捕获要求发送者为该签名账号、接收者为分享目标，并匹配歌曲与平台字段。联系人无需回复；设置目标会重建服务并取消旧等待。

回包以 `appid`、`prompt`、`title` 和 `jumpUrl` 识别归属，再检查 `desc` 与 `musicUrl`。QQ 可转存封面，`preview` 不参与匹配；已确认本次回包的字段错误会抛出 `MusicSignError`，`status` 为 `502`，`details.fields` 包含字段名。

匹配的内部回包通过应用的 `accept` 返回 `return` 终止后续插件分发，避免触发其他插件的分享解析。普通用户分享继续分发；SDK 的收包日志仍会记录。

`replyCard` 对 ICQQ 使用 `Bot[e.self_id].sdk.sendGroupMsg()` 或 `sendPrivateMsg()` 直接发送原生 JSON 段，按事件的 `group_id` / `user_id` 选择当前会话，绕过宿主的 Markdown 消息加工。OneBot v11 使用 `e.reply(segment.raw({ type: 'json', data: { data: raw } }))`。两种方式都保留已签出的原文和平台字段；发送失败时抛出含协议端详情的错误。其他会话适配器会明确提示未支持。

发送回执等待受 `timeoutMs` 限制。`#音之测测` 的开始通知与签名并行，通知失败写入日志；卡片发送超时报告当前会话发送失败。

## 扩展 ID 查询

按普通云崽插件的方式编写。可以在插件的 `handler` 中声明 `music.info.<来源名>`，也可以在 `init()` 中调用 `registerMusicResolver(type, resolver)`。音卡服务收到对应的 `type + id` 请求时，调用你的函数查询歌曲。

代码可以放在开发者自己的插件包中，也可以是 `plugins/example/` 下的单个 JS 文件。两种方式都在同一个云崽进程中运行，歌曲 API、登录信息和配置由提供查询的插件管理。

### 文件放在哪里

以 TS 插件 `my-plugin` 为例：

```text
Yunzai/
└── plugins/
    ├── music-card-sign/                 # 已安装的音卡插件，使用 lib 分支
    │   └── lib/models/music-info.js      # 运行时注册接口
    └── my-plugin/                       # 开发者自己的插件
        ├── src/
        │   ├── apps/music-source.ts     # 云崽应用，在 init 中注册
        │   └── models/music-resolver.ts # 调用自己的 API，映射歌曲字段
        └── lib/                         # my-plugin 编译后的运行文件
```

已有命令应用时，可把注册与清理逻辑合并进它的生命周期。新建 `src/apps/music-source.ts` 时，使用自己的插件加载器加载此应用；本例按 TS 模板导出插件类，运行前需构建自己的插件。

| 插件形式       | 注册代码位置                                     | 从该位置导入音卡模块                             |
| -------------- | ------------------------------------------------ | ------------------------------------------------ |
| TS 模板插件    | `my-plugin/src/apps/` 或 `my-plugin/src/models/` | `../../../music-card-sign/lib/models/music-info` |
| 普通 JS 插件   | `my-plugin/apps/` 或 `my-plugin/models/`         | `../../music-card-sign/lib/models/music-info.js` |
| 单文件 JS 插件 | `example/music-source.js`                        | `../music-card-sign/lib/models/music-info.js`    |

上表的导入路径用于直接注册。Handler 方式只需在应用中声明查询方法。TS 示例使用无扩展名导入，编译时通过自己的 `tsc-alias` 补齐 ESM 路径；普通 JS 直接导入运行文件时需要 `.js` 扩展名。

### 单文件 JS 插件

将下面内容保存为云崽根目录下的 `plugins/example/music-source.js`，修改 API 地址和字段映射后重启云崽。`example` 目录中的 JS 文件由云崽直接加载，`plugin` 类由本体提供，无需编译或创建插件包入口。加载方式见云崽文档的 [插件加载](https://yunzai-bot.com/dev/load.html)。

以下完整示例使用下一节的 API 响应格式：

```javascript
export class MusicSource extends plugin {
  constructor() {
    super({
      name: '我的音乐来源',
      dsc: '提供歌曲 ID 查询',
      event: 'message',
      priority: 1000,
      handler: [{ key: 'music.info.my-plugin', fn: 'resolveMusic' }],
      rule: []
    })
  }

  async resolveMusic(context, { id }) {
    const response = await context.json('https://music-api.example.com/song/detail', { id })
    const song = response.data
    if (response.code !== 0 || !song) {
      throw new Error(response.message || '查询歌曲失败')
    }
    if (song.id !== id) throw new Error('API 返回的歌曲 ID 与请求不符')
    return {
      title: song.name,
      singer: song.artist,
      url: song.link,
      audio: song.playUrl,
      image: song.cover || ''
    }
  }
}
```

`music-api.example.com` 是示例地址。来源名为 `my-plugin`，对应 Handler 名称 `music.info.my-plugin`。保存并加载后可发送：

```text
#音之测测 {"type":"my-plugin","id":"track:00123","_platform":"default"}
```

如果歌曲查询函数已经由其他插件导出，单文件 JS 也可以调用它。以下调用下一节 `my-plugin` 编译后导出的 `resolveOwnMusic`；使用其他插件时，替换为对方实际导出的路径和函数：

```javascript
import { resolveOwnMusic } from '../my-plugin/lib/models/music-resolver.js'

export class MusicSource extends plugin {
  constructor() {
    super({
      name: '音乐来源桥接',
      dsc: '调用其他插件的歌曲查询',
      event: 'message',
      priority: 1000,
      handler: [{ key: 'music.info.my-plugin', fn: 'resolveMusic' }],
      rule: []
    })
  }

  resolveMusic(context, { id }) {
    return resolveOwnMusic(id, context)
  }
}
```

这两份单文件示例选择一份使用。被调用的函数需返回下文的标准歌曲字段；来源名由 Handler 的 key 决定，与 JS 文件名无关。

### 1. 查询自己的 API 并返回歌曲字段

以下假设你已有一个歌曲 API，查询参数为 `id`，成功响应如下。`music-api.example.com` 是示例地址，需要替换为自己的服务；已有 API 返回格式不同，只需调整字段映射。

```json
{
  "code": 0,
  "data": {
    "id": "track:00123",
    "name": "歌曲名",
    "artist": "歌手",
    "link": "https://example.com/song/00123",
    "playUrl": "https://example.com/audio/00123.mp3",
    "cover": "https://example.com/cover/00123.jpg"
  }
}
```

在自己的 `src/models/music-resolver.ts` 中实现：

```typescript
import { registerMusicResolver } from '../../../music-card-sign/lib/models/music-info'
import type { MusicResolver } from '../../../music-card-sign/lib/types/music'

interface SongApiResponse {
  code: number
  message?: string
  data?: {
    id: string
    name: string
    artist: string
    link: string
    playUrl: string
    cover?: string
  }
}

export const resolveOwnMusic: MusicResolver = async (id, { json }) => {
  const response = (await json('https://music-api.example.com/song/detail', {
    id
  })) as SongApiResponse
  const song = response.data
  if (response.code !== 0 || !song) {
    throw new Error(response.message || '查询歌曲失败')
  }
  if (song.id !== id) {
    throw new Error('API 返回的歌曲 ID 与请求不符')
  }
  return {
    title: song.name,
    singer: song.artist,
    url: song.link,
    audio: song.playUrl,
    image: song.cover || ''
  }
}

export function installOwnMusicResolver() {
  return registerMusicResolver('my-plugin', resolveOwnMusic)
}
```

`'my-plugin'` 是你选定的查询来源名，不要求与目录名相同，但请求中的 `type` 必须与它完全一致，大小写也要一致。返回完整歌曲信息后，音卡插件继续完成分享提交、JSON 回传和缓存。

如果自己的插件已经有 API 客户端，将查询替换为实际客户端调用即可，例如 `const song = await musicApi.getSong(id, { signal })`，随后返回同一组标准字段。`musicApi` 由自己的插件导入或创建，`signal` 从解析器的第二个参数取得。

### 2. 在云崽应用中注册并清理

下面两种方式任选一种，均可放在自己的 `src/apps/music-source.ts`。

#### 方式一：声明查询 Handler

```typescript
import { resolveOwnMusic } from '../models/music-resolver'
import type { ResolverContext } from '../../../music-card-sign/lib/types/music'

export class MusicSource extends plugin<'message'> {
  constructor() {
    super({
      name: '我的音乐来源',
      dsc: '提供歌曲 ID 查询',
      event: 'message',
      priority: 1000,
      handler: [{ key: 'music.info.my-plugin', fn: 'resolveMusic' }],
      rule: []
    })
  }

  resolveMusic(context: ResolverContext, { id }: { id: string }) {
    return resolveOwnMusic(id, context)
  }
}
```

云崽加载应用时注册 Handler，卸载时按应用的 namespace 移除，因此这份写法无需在 `init()` 中注册查询函数或保存注销函数。相同 key 有多个 Handler 时，沿用云崽的 priority 顺序。

查询方法的第一个参数是音卡服务创建的 `ResolverContext`，第二个参数为 `{ type, id }`。这里的 context 提供 `signal/json/fetchImpl`，用于歌曲查询；它没有聊天事件的 `reply` 或 `runtime`。Handler 必须返回标准歌曲信息，查询失败时抛出错误。

#### 方式二：直接注册查询函数

```typescript
import { installOwnMusicResolver } from '../models/music-resolver'

export class MusicSource extends plugin<'message'> {
  private unregister?: () => void

  constructor() {
    super({
      name: '我的音乐来源',
      dsc: '提供歌曲 ID 查询',
      event: 'message',
      priority: 1000,
      rule: []
    })
  }

  init() {
    const install = () => {
      this.unregister?.()
      this.unregister = installOwnMusicResolver()
    }
    install()
    if (typeof this.addCleanup === 'function') {
      this.addCleanup(() => this.unregister?.(), install)
    }
  }

  onUnload() {
    this.unregister?.()
    this.unregister = undefined
  }
}
```

该应用只负责注册查询函数，`rule: []` 不新增聊天指令。已有应用时，保留自己的命令规则，将 `install()` 调用合入 `init()`，将注销函数合入清理逻辑。

TRSS 提供 `addCleanup` 时，清理会注销来源，恢复会重新注册；JiuLi 的 `onUnload` 会注销来源。注销函数可重复调用。自己的插件卸载后，后续未命中缓存的请求需要重新注册来源才能查询。

### 3. 构建、加载并发起 ID 请求

TS 插件先构建，再重启云崽；`plugins/example/` 中的单文件 JS 可直接加载。确认提供查询的应用已加载。音卡服务和开发者插件必须运行在同一个云崽进程。

由主人先发送测试指令：

```text
#音之测测 {"type":"my-plugin","id":"track:00123","_platform":"default"}
```

这次会重新调用你的 API，再由 icqq 生成音卡并发送到当前会话。看到“音之测测通过”，说明查询、生成和发送均已完成。

HTTP 向签名地址 POST 同一请求：

```json
{ "type": "my-plugin", "id": "track:00123", "_platform": "default" }
```

HTTP 成功时返回完整音卡 JSON；在自己的聊天命令中使用此请求，则按 [Handler 接入](#handler-接入) 调用并发送。HTTP、`music.sign` 和测试命令都支持上述两种查询接法。

### 解析器参数与返回值

函数类型：

```typescript
import type { MusicInfo, ResolverContext } from '../../../music-card-sign/lib/types/music'

type MusicResolver = (id: string, context: ResolverContext) => MusicInfo | Promise<MusicInfo>
```

| 参数                                        | 含义                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`                                        | 字符串 ID；字符串原样保留，数字请求转换为十进制字符串                                    |
| `context.type`                              | 本次查询来源名，与请求 `type` 一致                                                       |
| `context.timeoutMs`                         | 整次查询的时间上限，包含所有 API 请求及响应读取                                          |
| `context.signal`                            | 超时或查询结束后取消；自己的 API 客户端应接收该信号                                      |
| `context.json(endpoint, params?, options?)` | 发起 HTTP 请求并读取 JSON；`params` 为字符串查询参数，`options` 可携带请求方法、头和正文 |
| `context.fetchImpl(input, options?)`        | 带查询取消信号的 fetch，返回 `Response`，状态检查和正文解析由调用方完成                  |

查询参数的 TS 类型可从 `lib/types/music` 导入 `MusicResolver`、`ResolverContext`、`MusicInfo`、`ResolveOptions`。解析器只接收 `id` 和上述上下文，不接收聊天事件或完整签名请求；API 地址、Cookie 等读取自己的插件配置。

返回值要求：

| 标准字段 | 必需 | 示例 API 字段 | 要求                                     |
| -------- | ---- | ------------- | ---------------------------------------- |
| `title`  | 是   | `name`        | 非空歌名字符串                           |
| `singer` | 是   | `artist`      | 非空歌手字符串，多位歌手由自己的插件组合 |
| `url`    | 是   | `link`        | 歌曲跳转的 HTTP(S) 地址                  |
| `audio`  | 是   | `playUrl`     | 实际音频的 HTTP(S) 地址                  |
| `image`  | 否   | `cover`       | 图片 HTTP(S) 地址，可省略或为空          |

上表是 ID 查询返回类型 `MusicInfo` 的要求，解析器仍需返回可用的 `audio` 地址。直接提交歌曲信息时的可空音频规则见 [Handler 接入](#handler-接入)。

ID 查询返回的 `title` 和 `singer` 会去掉两端空白，地址会验证并规范化；协议相对地址 `//...` 会补为 HTTPS。接口业务失败、歌曲 ID 不符或无法取得播放地址时，自己的解析器应抛出错误。音卡插件会检查标准字段，但不会替你检查自定义 API 的业务码或 ID 是否匹配。

`json()` 会检查 HTTP 状态并解析 JSON，不检查你的业务码；`fetchImpl()` 还需要调用方检查 `response.ok`。两者限制为 HTTP(S)，不自动跟随重定向。API 需要跟随重定向时，可使用自己的客户端并传递 `signal`。

通过音卡服务调用时，查询上限采用插件配置的 `timeoutMs`。直接调用 `resolveMusicInfo()` 时，默认查询上限为 8000 毫秒。超时会返回错误；自己的客户端若忽略 `signal`，后台请求仍可能继续，需在客户端接入取消处理。

### 来源、签名平台与缓存

| 设置                   | 控制的内容                             |
| ---------------------- | -------------------------------------- |
| `type: "my-plugin"`    | 调用哪个 ID 查询函数                   |
| `id: "track:00123"`    | 将哪个 ID 传给该函数                   |
| `_platform: "default"` | 强制使用哪组应用信息提交分享           |
| 配置 `platforms`       | 给音卡应用信息命名，不注册歌曲查询函数 |

音卡服务优先调用对应的 `music.info.<type>` Handler，没有对应 Handler 时使用 `registerMusicResolver()` 注册的函数，再使用内置来源。Handler 移除后，未命中缓存的请求按这个顺序继续查询；同一原始请求的历史缓存仍可复用。Handler 返回无效字段或抛出错误时，直接报告失败。

平台在调用查询函数前确定。请求未携带跳转链接或显式平台时，采用配置的 `defaultPlatform`；返回的网易云、QQ 音乐等链接用于卡片跳转，不会重新选择平台。请求中已经提供的歌曲字段会覆盖查询返回的同名字段，所以只按 ID 查询时建议提交上面的最小请求。

ID 请求的精确缓存保存的是完整音卡 JSON。命中缓存时跳过解析器，不会重新访问自己的歌曲 API；并发相同请求共用一次查询。更新 API、切换登录态或播放地址失效后，用 `#音之测测 {请求JSON}` 强制重新查询与签名，成功后更新缓存。

### 覆盖内置来源或单次直接查询

注册为 `qq`、`163`、`kugou`、`kuwo`、`migu` 时，会覆盖对应内置查询。相同来源名最近一次注册生效，旧注销函数不会删除后来注册的函数；注销当前函数后回到内置查询，不会恢复更早的自定义注册。覆盖内置查询也需按 [缓存](#来源签名平台与缓存) 规则处理已有结果。

只想取得标准歌曲信息时，直接调用同模块的 `resolveMusicInfo()`，不会生成或发送音卡，也不使用音卡缓存：

```typescript
import { resolveMusicInfo } from '../../../music-card-sign/lib/models/music-info'

export async function queryMusicById(id: string) {
  return resolveMusicInfo('my-plugin', id, { timeoutMs: 10000 })
}
```

`options` 可传 `timeoutMs`、`fetchImpl` 和 `resolvers`。本次调用的 `resolvers[type]` 优先于全局注册，其次使用内置来源。直接调用 `resolveMusicInfo()` 使用函数注册表；声明式查询 Handler 由音卡服务调用。需要在同一进程中直接查询 Handler 来源时，可调用 `lib/modules/music-card-sign/resolver` 导出的 `resolveWithHandler(type, id, options)`，调用级 `resolvers[type]` 仍优先。

### 接入检查

| 现象                         | 检查方法                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------- |
| 找不到模块                   | 核对两个插件是否并列安装、导入路径层级及 `music-card-sign/lib` 是否存在           |
| 提示未注册该音乐来源         | 确认应用已加载；Handler key 或直接注册的来源名需与请求 `type` 一致                |
| 放进 `models/` 后没有生效    | 模型文件需由已加载的应用导入，并在生命周期中调用注册函数                          |
| 单文件 JS 没有被加载         | 确认位于 `plugins/example/` 且导出插件类；直接导入其他 JS 模块时填写 `.js` 扩展名 |
| 查询 Handler 没有被调用      | key 应为 `music.info.<type>`，与请求的 `type` 完全一致；用测试命令排除缓存        |
| API 没有收到请求             | 用 `#音之测测` 排除缓存，并检查音卡服务开关、在线 icqq 账号和来源注册             |
| API 成功，但歌曲信息校验失败 | 核对字段映射，ID 查询要求非空 `title/singer` 及有效 `url/audio`                   |
| 设置了 ID 却没有查询         | 请求中有歌名时走完整歌曲模式；只传 ID 时省略 `title/song/name`                    |
| 卡片平台与返回链接不同       | 平台在查询前确定；用 `_platform` 指定应用，或调整请求跳转地址及默认平台           |
| 改了 API 后仍返回旧卡        | 精确缓存命中会跳过查询，用测试命令强制重新生成                                    |
| 查询一直等待或超时后仍发请求 | 检查 API 客户端的超时与 `signal` 支持                                             |

## 测试与资源释放

离线测试使用模拟 QQ 消息和本地 Express，覆盖匹配、联系人发送与同步回传、完整 JSON、并发、精确缓存、ID 扩展、命令和配置迁移。接入账号后的回传检查使用 `#音之测测`。

测试源码统一为 `.test.ts`，与业务源码一样使用严格类型检查和无扩展名导入。`pnpm test` 先生成生产 `lib`，再按 `tsconfig.test.json` 将源码与测试编译到 `.test-tmp/compiled/`，最后由 Node 执行测试 JS。宿主夹具从项目根目录复制真实发布入口和 `lib`，同时测试锅巴保存与失败恢复；临时编译文件不参与发布。

并发重复请求共用一次查询和提交；相同账号、`appid`、`prompt`、`title` 和 `jumpUrl` 的请求按顺序提交，歌手、音频、封面或应用配置不同也遵守此顺序，其他歌曲仍可并行。缓存身份继续包含完整原请求。

每个签名账号共用一组 SDK 私聊与 `sync.message` 订阅，通过 Map 查找等待项。私聊先监听 `message.private.friend` / `message.private.self` 叶子事件；EventEmitter 使用 `prependListener`，在后续业务监听执行前捕获回包。同一事件匹配后不重复解析，无关音卡不遍历等待歌曲，命中后只校验对应请求。匹配成功或字段错误立即结束等待，清除超时器和等待记录；账号最后一项请求结束后解绑监听器。

完整 JSON 返回后后台写入缓存，同一完整请求在落盘期间复用已捕获的原卡。同一缓存身份的写入按顺序完成，强制签出的新卡不会被较早的写入覆盖。写入结束清除临时记录；关闭和重新开启服务会等待旧缓存写入完成。

回包事件使用 WeakSet 标记；为关联同一消息的独立 sync 和私聊事件，额外保存账号、联系人与消息 ID，30 秒过期，最多 256 条。记录不持有事件和卡片正文，不创建定期清理任务，读取和新回包会清理过期记录，关闭服务时清空。

SDK 订阅测试使用 `triptrap@0.0.17`，验证锅巴保存、成功回传、超时与关闭服务后调用订阅返回的取消函数，并保留宿主已有监听。命令测试覆盖通知失败、回执迟到及一直未返回的情况。

提供 `addCleanup` 的 TRSS 通过该方法注册清理与恢复；JiuLi 通过 `onUnload` 关闭服务。两种清理入口可重复调用，不会重复注册 HTTP 路由。测试覆盖无 `addCleanup` 的初始化、卸载中的回传取消、宿主鉴权和未就绪响应。

## 自动编译与发布

### 本地构建

在插件源码目录执行：

```sh
pnpm install --ignore-workspace
pnpm run build
```

`build:code` 编译 `src/`，`build:template` 将 `ktr/template/` 打包到 `lib/react-template/`，`build:web` 将 React 页面打包到 `webadapter/`。模板与 WebUI 的 React、HeroUI 依赖随产物打包，安装 `lib` 分支只需运行依赖。

使用 `pnpm run dev:template` 预览 ktr 模板；`pnpm run dev:web` 启动 WebUI 开发服务。页面功能需要面板提供同源 API，独立预览时会提示从面板打开。

### 图片与页面入口

帮助、设置和状态共用 `src/modules/music-card-sign/render.ts`。完整 HTML 的 CSS 已内嵌，通过固定的 `resources/help/render.html` 包装页传入宿主；`base` 保留资源相对于 ktr 输出目录的定位。宿主只编译包装页，不再将 React 页面作为 art-template 源码编译。

渲染与截图按顺序执行。ktr 及宿主均使用固定输出文件，成功或失败后删除本次 HTML；宿主只缓存和监听一份固定包装页。清理仅处理插件本次生成的文件。

`webadapter/index.js` 导出面板 `init(ctx)`，注册两张页面及其 `app.js/app.css` 资源。QQBot-Web-Adapter 和锅巴 next 的 API 前缀不同，入口按各自上下文注册。管理接口由面板鉴权，页面只向同源地址发送锅巴 token；后端复用配置验证、生命周期和签名服务。

`main` 保存 TS 源码，`lib/` 不提交到 `main`。每次推送 `main`，GitHub Actions 按模板检出云崽和插件，安装锁定依赖，运行类型、lint、格式检查及编译产物测试。

检查通过后，将 `package.json.files` 中的运行文件和文档发布到 `lib` 分支，同时上传 `music-card-sign-js` 产物。发布包移除开发依赖和开发脚本，JS 与类型声明一起保留。工作流也支持手动运行。
