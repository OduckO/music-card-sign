# 开发指南

[返回 README](../README.md) · [接口文档](api.md)

这份指南解决两件事：

- **生成并发送卡片**：用 [Handler 接入](#handler-接入)。Handler 是云崽插件之间调用函数的接口。
- **用自己的 API 查歌曲**：用[扩展 ID 查询](#扩展-id-查询)。你的代码返回歌名和链接，音卡插件负责签名。

只想先试一下扩展，可直接用[单文件 JS 示例](#单文件-js-插件)。要修改本插件源码，再看[源码开发](#源码开发)。

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

把示例地址换成实际歌曲地址，在自己的命令函数中调用 `await sendMusicCard(e)`。失败会抛出错误，由你的插件决定如何回复。

`audio` 可省略、为空字符串或 `null`；有值时必须是 HTTP(S) 地址。其余字段见 [API 文档](api.md#自定义歌曲)。

自定义来源注册后，可把歌曲字段替换为 `{ type: 'my-plugin', id: 'track:00123', _platform: 'default' }`，其余调用方式相同。

### 账号、平台与发送目标

请求中的 `self_id` / `bot_id` 优先于配置 `botId`。选定的账号离线时，临时用框架列表中第一个在线 icqq 账号代签。未指定账号时，优先用当前 ICQQ 会话的账号，否则要求只有一个 icqq 账号在线。

平台按 [API 平台规则](api.md#自定义平台)选择。`type` 决定去哪查歌曲，`_platform` 决定用哪个应用签名。

签名时先向配置的 `targetId` 发分享，留空则发给签名账号自己。收到卡片后，`replyCard(e, raw)` 将它发送到 `e` 所在的群或私聊，支持 ICQQ、OneBot v11 和 Milky。ICQQ 使用原生 SDK，OneBot v11 使用 JSON 消息，Milky 交给 TRSS 转成 `light_app`。

发送回执受 `timeoutMs` 限制。超过时间或协议端发送失败时会抛出错误。回包匹配、内部消息拦截和缓存的实现见[测试与资源释放](#测试与资源释放)。

## 扩展 ID 查询

ID 查询扩展就是一个普通云崽插件：收到 `type + id` 后，你调用自己的 API，把结果转换为标准歌曲字段。音卡服务再用这些字段生成卡片。

代码放在你自己的插件包，或 `plugins/example/` 的单个 JS 文件中，**不要放进音卡插件目录**。两者要在同一个云崽进程运行；API 地址、登录信息和配置由你的插件管理。

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

已有应用可直接加入查询方法。新建 TS 应用时，按你自己的插件加载方式导出类并构建。

| 插件形式       | 注册代码位置                                     | 从该位置导入音卡模块                             |
| -------------- | ------------------------------------------------ | ------------------------------------------------ |
| TS 模板插件    | `my-plugin/src/apps/` 或 `my-plugin/src/models/` | `../../../music-card-sign/lib/models/music-info` |
| 普通 JS 插件   | `my-plugin/apps/` 或 `my-plugin/models/`         | `../../music-card-sign/lib/models/music-info.js` |
| 单文件 JS 插件 | `example/music-source.js`                        | `../music-card-sign/lib/models/music-info.js`    |

Handler 方式无需导入注册函数。直接注册时使用上表路径：TS 不写扩展名，由自己的 `tsc-alias` 处理；JS 必须写 `.js`。

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
    artist?: string
    link: string
    playUrl?: string
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

`my-plugin` 是查询来源名，可以和目录名不同，但请求的 `type` 必须与它完全一致，包括大小写。

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

云崽负责注册和卸载 Handler，无需自己保存注销函数。同名 Handler 按云崽的 priority 顺序调用。

这里的 `context` 是查询工具，提供 `signal/json/fetchImpl`，不是聊天事件，没有 `reply` 或 `runtime`。第二个参数是 `{ type, id }`。成功返回歌曲字段，失败抛出错误。

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

`rule: []` 表示不新增聊天命令。合入已有应用时保留原来的规则，只加入注册与清理逻辑。

TRSS 用 `addCleanup` 注销和恢复来源，JiuLi 用 `onUnload` 注销。注销函数可以重复调用；卸载后，未命中缓存的请求需等来源重新注册才能查询。

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

HTTP 成功返回卡片 JSON。自己的聊天命令可用同一请求调用 [music.sign](#handler-接入)。两种注册方式均支持 HTTP、Handler 和测试命令。

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
| `context.metadataOnly`                      | 为 `true` 时只需要歌曲信息，可跳过额外的播放地址查询                                     |
| `context.timeoutMs`                         | 整次查询的时间上限，包含所有 API 请求及响应读取                                          |
| `context.signal`                            | 超时或查询结束后取消；自己的 API 客户端应接收该信号                                      |
| `context.json(endpoint, params?, options?)` | 发起 HTTP 请求并读取 JSON；`params` 为字符串查询参数，`options` 可携带请求方法、头和正文 |
| `context.fetchImpl(input, options?)`        | 带查询取消信号的 fetch，返回 `Response`，状态检查和正文解析由调用方完成                  |

类型从 `lib/types/music` 导入。解析器只收到 ID 和查询上下文，不收到聊天事件或完整签名请求；Cookie 等信息从自己的配置读取。

返回值要求：

| 标准字段 | 必需 | 示例 API 字段 | 要求                                                    |
| -------- | ---- | ------------- | ------------------------------------------------------- |
| `title`  | 是   | `name`        | 非空歌名字符串                                          |
| `singer` | 否   | `artist`      | 歌手字符串，可省略或为空，多位歌手由自己的插件组合      |
| `url`    | 是   | `link`        | 歌曲跳转的 HTTP(S) 地址                                 |
| `audio`  | 否   | `playUrl`     | 实际音频的 HTTP(S) 地址，可省略或为空；无音频生成图文卡 |
| `image`  | 否   | `cover`       | 图片 HTTP(S) 地址，可省略或为空                         |

最少返回 `{ title: song.name, url: song.link }` 就能生成图文卡。已知歌手请一并返回，普通 ID 查询不会再补查歌手。

服务会去掉歌名、歌手两端的空白，并检查地址；`//...` 地址会补成 HTTPS。API 的业务码和歌曲 ID 是否正确，需要你自己检查。歌曲存在但没有播放权限时，可以返回空 `audio`。

`json()` 会检查 HTTP 状态并解析 JSON，不检查你的业务码；`fetchImpl()` 还需要调用方检查 `response.ok`。两者限制为 HTTP(S)，不自动跟随重定向。API 需要跟随重定向时，可使用自己的客户端并传递 `signal`。

通过音卡服务调用时，查询上限采用插件配置的 `timeoutMs`。直接调用 `resolveMusicInfo()` 时，默认查询上限为 8000 毫秒。超时会返回错误；自己的客户端若忽略 `signal`，后台请求仍可能继续，需在客户端接入取消处理。

### 来源、签名平台与缓存

| 设置                   | 控制的内容                             |
| ---------------------- | -------------------------------------- |
| `type: "my-plugin"`    | 调用哪个 ID 查询函数                   |
| `id: "track:00123"`    | 将哪个 ID 传给该函数                   |
| `_platform: "default"` | 强制使用哪组应用信息提交分享           |
| 配置 `platforms`       | 给音卡应用信息命名，不注册歌曲查询函数 |

查询顺序是同名 Handler → 直接注册的函数 → 内置来源。Handler 返回错误或无效字段时直接失败，不会继续换来源尝试；移除 Handler 后才按顺序使用下一个来源。

平台在查询前确定，查询结果的链接不会改变它。请求中已有的歌曲字段会覆盖查询结果；只按 ID 查询时，使用上面的最小请求即可。

缓存保存完整音卡；命中时不再查 API，并发相同请求共用一次查询。更换 API、登录态或播放地址后，用 `#音之测测 {请求JSON}` 强制重新查询并更新缓存。

### 覆盖内置来源或单次直接查询

注册为 `qq`、`163`、`kugou`、`kuwo`、`migu` 时，会覆盖对应内置查询。相同来源名最近一次注册生效，旧注销函数不会删除后来注册的函数；注销当前函数后回到内置查询，不会恢复更早的自定义注册。覆盖内置查询也需按 [缓存](#来源签名平台与缓存) 规则处理已有结果。

只想取得标准歌曲信息时，直接调用同模块的 `resolveMusicInfo()`，不会生成或发送音卡，也不使用音卡缓存：

```typescript
import { resolveMusicInfo } from '../../../music-card-sign/lib/models/music-info'

export async function queryMusicById(id: string) {
  return resolveMusicInfo('my-plugin', id, { timeoutMs: 10000 })
}
```

`options` 可传 `timeoutMs`、`fetchImpl`、`resolvers` 和 `metadataOnly`。`metadataOnly: true` 只查询歌曲信息并返回空音频，内置 QQ 音乐、网易云和酷我会跳过播放接口；自定义解析器可读取上下文中的同名字段。本次调用的 `resolvers[type]` 优先于全局注册，其次使用内置来源。直接调用 `resolveMusicInfo()` 使用函数注册表；声明式查询 Handler 由音卡服务调用。需要在同一进程中直接查询 Handler 来源时，可调用 `lib/modules/music-card-sign/resolver` 导出的 `resolveWithHandler(type, id, options)`，调用级 `resolvers[type]` 仍优先。

### 接入检查

| 现象                         | 检查方法                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| 找不到模块                   | 核对两个插件是否并列安装、导入路径层级及 `music-card-sign/lib` 是否存在                        |
| 提示未注册该音乐来源         | 确认应用已加载；Handler key 或直接注册的来源名需与请求 `type` 一致                             |
| 放进 `models/` 后没有生效    | 模型文件需由已加载的应用导入，并在生命周期中调用注册函数                                       |
| 单文件 JS 没有被加载         | 确认位于 `plugins/example/` 且导出插件类；直接导入其他 JS 模块时填写 `.js` 扩展名              |
| 查询 Handler 没有被调用      | key 应为 `music.info.<type>`，与请求的 `type` 完全一致；用测试命令排除缓存                     |
| API 没有收到请求             | 用 `#音之测测` 排除缓存，并检查音卡服务开关、在线 icqq 账号和来源注册                          |
| API 成功，但歌曲信息校验失败 | 核对字段映射，要求非空 `title` 与有效 `url`；`singer/audio/image` 可为空，非空地址须为 HTTP(S) |
| 设置了 ID 却没有查询         | 请求中有歌名时走完整歌曲模式；只传 ID 时省略 `title/song/name`                                 |
| 卡片平台与返回链接不同       | 平台在查询前确定；用 `_platform` 指定应用，或调整请求跳转地址及默认平台                        |
| 改了 API 后仍返回旧卡        | 精确缓存命中会跳过查询，用测试命令强制重新生成                                                 |
| 查询一直等待或超时后仍发请求 | 检查 API 客户端的超时与 `signal` 支持                                                          |

## 源码开发

需要 Node.js 24 和 pnpm 9。在开发目录执行：

```sh
git clone -b main https://github.com/OduckO/music-card-sign.git
cd music-card-sign
pnpm install --ignore-workspace --frozen-lockfile
```

| 目录                               | 修改什么时看它               |
| ---------------------------------- | ---------------------------- |
| `src/apps/`                        | 聊天命令、服务入口与 Handler |
| `src/models/`                      | 签名、歌曲查询、缓存与 HTTP  |
| `src/modules/music-card-sign/`     | 配置保存、发卡、图片与更新   |
| `src/modules/guoba/`               | 锅巴表单                     |
| `src/config/`、`resources/config/` | 配置加载与默认值             |
| `webadapter/src/`                  | React 网页                   |
| `ktr/template/`                    | 帮助和状态图片               |
| `test/`                            | TypeScript 测试              |

项目沿用 [Yunzai TS 模板](https://github.com/KaguyaJs/Yunzai-Plugin-Example-TS)，目录说明见[云崽开发文档](https://yunzai-bot.com/dev/folder.html#ts-插件结构)。构建可独立运行，插件本身需由云崽加载。

新增应用时，在 `src/apps/` 导出名称唯一的 `plugin` 子类，构建后自动加载。入口只扫描 `lib/apps/` 当前层，加载超时交给云崽处理。新增命令共用现有服务，不重复初始化 HTTP 或监听器。服务在 `init()` 中加载，命令与更新按需加载。

### 类型与代码规范

使用 [TRSS-Yunzai-Types](https://github.com/KaguyaJs/TRSS-Yunzai-Types) 的类型：聊天事件从 `trss-yunzai` 导入，锅巴类型从 `trss-yunzai/guoba` 导入。

TS 导入不写 `.js` 扩展名，`tsc-alias` 在构建时处理别名和运行路径。根目录 JS 文件只是云崽和锅巴的入口。

Oxlint 检查正确性、可疑写法与性能规则；Oxfmt 负责排版，使用两空格、单引号、无分号、无尾逗号、100 列和 LF。构建产物、运行数据、临时文件与锁文件不参与格式化。

| 命令                                        | 用途                          |
| ------------------------------------------- | ----------------------------- |
| `pnpm run typecheck`                        | 检查源码和测试类型            |
| `pnpm run lint` / `pnpm run lint:fix`       | 检查代码 / 自动修复支持的规则 |
| `pnpm run format` / `pnpm run format:check` | 格式化 / 只检查格式           |
| `pnpm run build`                            | 构建代码、图片模板和 WebUI    |
| `pnpm run build:test`                       | 将测试编译到临时目录          |
| `pnpm test`                                 | 构建并执行全部测试            |

## 测试与资源释放

测试使用模拟 QQ 消息和本地 Express，覆盖签名匹配、并发、缓存、ID 扩展、命令、配置与面板接口。测试文件是 `.test.ts`，编译到 `.test-tmp/compiled/` 后由 Node 执行。真实账号的签名与发送用 `#音之测测` 检查。

维护签名代码时保留以下规则：

- 同一账号下，`appid/prompt/title/jumpUrl` 相同的请求依次提交，其他歌曲可并行。排队计入回传超时，排队超时后不再发送。
- 收到匹配的 JSON 就返回，缓存后台写入。同一缓存的写入依次完成，关闭服务会等待写入结束。
- SDK 私聊和 `sync.message` 共用每个账号的订阅；匹配、出错或超时后清理等待项，最后一项结束后解除监听。
- 以平台、提示文字、歌名和跳转链接匹配回包，接受长标题截断和空音频图文卡。QQ 改写的歌手、音频、封面不参与匹配。
- 框架上报前拦截本次签名回包，普通私聊、群聊和无关分享继续分发。消息 ID 记录保留 30 秒；提交记录保留 `timeoutMs + 30 秒`，各最多 256 条，关闭服务时清空。
- TRSS 通过 `addCleanup` 清理和恢复，JiuLi 通过 `onUnload` 关闭服务。重复清理不能重复注册路由或监听。

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

帮助、设置和状态共用 `src/modules/music-card-sign/render.ts`。React 输出的 HTML 已内嵌 CSS，宿主只编译固定包装页 `resources/help/render.html`，避免 art-template 再次解析 React 页面导致样式丢失。`base` 保留资源路径。

截图依次执行，结束后清理本次临时 HTML。宿主只缓存和监听固定包装页，避免不断增加 HTML 文件。

`webadapter/index.js` 导出面板 `init(ctx)`，注册一个 `panel.html` 工作台及其 `app.js/app.css` 资源，设置与音卡请求通过页内标签切换。QQBot-Web-Adapter 的 `apiBase` 是全局 `/api`，接口再加 `/music-card-sign`；锅巴 next 的 `apiBase` 已包含 `/api/custom/<插件名>`，接口直接注册 `/config`、`/friends`、`/sign`。两种宿主都会传入 `basePath`，它不能用来区分接口前缀。

管理接口由面板鉴权，页面只向同源地址发送锅巴 token。`GET /config` 返回在线 icqq 账号及配置，`POST /friends` 接收字符串 `botId`，只返回该签名账号的好友；空值仅在一个 icqq 账号在线时自动选择。服务关闭不影响账号与好友查询。签名请求和配置保存继续复用现有服务。

`main` 保存 TS 源码，`lib/` 不提交到 `main`。每次推送 `main`，GitHub Actions 按模板检出云崽和插件，安装锁定依赖，运行类型、lint、格式检查及编译产物测试。

检查通过后，将 `package.json.files` 中的运行文件和文档发布到 `lib` 分支，同时上传 `music-card-sign-js` 产物。发布包移除开发依赖和开发脚本，JS 与类型声明一起保留。工作流也支持手动运行。
