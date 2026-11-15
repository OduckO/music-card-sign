# 云崽本地 icqq 音卡签名

复用 TRSS-Yunzai 的 ICQQ-Plugin 登录账号，向账号自己提交应用分享，监听自己收到的音乐 JSON。请求匹配成功后，保存完整原文并返回给 HTTP 调用方或当前会话；完全相同的请求优先复用已保存的音卡。

## 使用

1. 在云崽根目录安装已编译的 `lib` 分支：

   ```sh
   git clone -b lib https://github.com/OduckO/music-card-sign.git plugins/music-card-sign
   pnpm --dir plugins/music-card-sign install --prod
   ```

   `main` 分支存放 TS 源码，`lib` 分支可直接供云崽加载。
2. 版本要求：`@icqqjs/icqq 1.10.3`，通过云崽 ICQQ-Plugin 接入签名账号。音卡可发送到支持 JSON 卡片的其它协议账号。
3. 首次加载使用云崽配置工具生成云崽根目录的 `config/music-card-sign.yaml`。多个 icqq 账号时可用 `#设置音乐签名Bot <QQ号>` 设置 `botId`，保存后立即生效；请求也可传入 `self_id`。手动修改配置文件后重启云崽。
4. 默认复用云崽 HTTP 服务，在调用方配置签名地址 `http://127.0.0.1:<云崽端口>/music_card/card`。宿主启用了 HTTP 鉴权时，携带对应鉴权信息。
5. 需要保留原脚本的本地 4567 端口时，把 `localPort` 从 `0` 改成 `4567`。额外服务仅监听 `127.0.0.1`，签名地址为 `http://127.0.0.1:4567/music_card/card`。这可隔离宿主 HTTP 鉴权与协议端的本地签名调用。

如果旧音乐签名脚本也已安装，停用它，避免相同命令及本地端口发生冲突。

项目采用 [Yunzai-Plugin-Example-TS](https://github.com/KaguyaJs/Yunzai-Plugin-Example-TS) 的入口、目录、配置方式和构建工具：

```text
music-card-sign/
├── index.js                         # 加载 lib/index.js
├── src/
│   ├── index.ts                      # 使用 loadApps 导出应用
│   ├── dir.ts                        # 插件、应用和资源目录
│   ├── apps/music-card-sign.ts        # 主人命令、Handler 与服务生命周期
│   ├── models/                       # 签名、查询、精确缓存与 HTTP
│   ├── modules/loader/index.ts        # 加载编译后的应用
│   ├── config/index.ts               # 云崽 YAML 配置与旧配置迁移
│   ├── types/                        # 配置、请求、回包与扩展解析器类型
│   └── utils/                        # 错误信息处理
├── resources/config/config.yaml      # 默认配置
├── lib/                              # tsc + tsc-alias 生成的 JS 和类型声明
├── test/                             # 测试编译后的 JS
├── .github/workflows/build-push-lib.yml
├── tsconfig.json
├── eslint.config.js
├── pnpm-lock.yaml
└── package.json
```

成功音卡仍保存在插件的 `data/music-card-cache/`。从旧 JS 版升级时，若 YAML 尚不存在，会自动迁移插件中的 `config/config/config.json`，保留旧文件；已有 YAML 优先。升级时保留旧配置和缓存目录。

安装 `lib` 分支后，在云崽根目录更新：

```sh
git -C plugins/music-card-sign pull
pnpm --dir plugins/music-card-sign install --prod
```

## 开发与自动编译

需要 Node.js 24 和 pnpm 9。在源码仓库中运行：

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm test
```

`pnpm run build` 使用模板的 `tsc && tsc-alias`，严格检查 TS，并把 `@/`、`~/` 别名转换成可执行的相对 `.js` 路径。`lib/` 不提交到 `main`；类型声明随 JS 一起生成，方便其它插件接入。

每次推送 `main`，GitHub Actions 会按模板检出云崽和插件，安装锁定依赖，执行类型检查、lint、构建与离线测试。全部通过后，将 `package.json.files` 中的运行文件推到 `lib` 分支，并上传 `music-card-sign-js` 产物。发布包移除开发依赖和开发脚本。工作流也支持手动运行。

离线测试覆盖签名匹配、并发与资源释放、完整 JSON、精确缓存、ID 扩展、命令、配置迁移和本地 Express HTTP。测试使用模拟 QQ 消息；实际账号接入后可运行 `#音之测测` 检查音卡回传。

配置字段：

| 字段 | 默认值 | 用途 |
|---|---|---|
| `enabled` | `true` | 加载时是否启用 |
| `botId` | `""` | 固定签名账号；留空仅在一个 icqq 账号在线时自动选择 |
| `path` | `/music_card/card` | 宿主与额外回环服务的签名路由 |
| `timeoutMs` | `15000` | 歌曲查询超时及提交后等待回传的超时，各阶段独立计时 |
| `localPort` | `0` | `0` 复用宿主；非零额外启动回环地址服务 |
| `apiKey` | `""` | 可选插件鉴权，使用 `Authorization: Bearer <key>` 或 `X-API-Key` |
| `platforms` | `{}` | 平台名称到应用三元组的映射 |
| `testMusic` | 《晴天》的自定义请求 | `音之测测` 默认歌曲，可替换为自己的有效歌曲字段，支持 `_platform` |

## API

兼容 [LuckyLilliaBot 的 sign.ts](https://github.com/LuckyLilliaDev/LuckyLilliaBot/blob/main/src/common/utils/sign.ts)：直接 POST 配置的完整 URL，`Content-Type: application/json`。

自定义歌曲：

```json
{
  "type": "custom",
  "title": "晴天",
  "singer": "周杰伦",
  "url": "https://music.163.com/#/song?id=186016",
  "audio": "https://music.163.com/song/media/outer/url?id=186016.mp3",
  "image": "https://example.com/cover.jpg"
}
```

`title/url/audio` 必需。`singer/content/image` 可省略；`singer` 优先于 `content`。上述示例只说明字段格式，封面需换为实际可用地址。`type: custom` 默认 QQ 音乐应用；标准 `type: qq/163/kugou/kuwo/migu` 使用对应平台身份。

ID 模式：

```json
{ "type": "163", "id": "186016" }
```

内置 `qq/163/kugou/kuwo/migu`。查询歌名、歌手、封面和播放地址后生成卡片。ID 字符串原样保留，QQ 可用数字 ID 或 songmid，酷狗使用 hash。其他插件可注册自己的来源，或替换内置查询，接入方法见下文。

隐藏扩展 `_platform` 只控制卡片的应用身份，不改变歌曲查询来源。保留 `type: custom` 即可指定其它平台：

```json
{
  "type": "custom",
  "_platform": "netease",
  "title": "歌曲名",
  "singer": "歌手",
  "url": "https://example.com/song",
  "audio": "https://example.com/audio.mp3"
}
```

预置名称为 `qq`、`netease`（别名 `163`）、`kuwo`、`kugou`、`migu`、`bilibili`、`5sing`、`bodian`、`tim`、`yuanshen`。也可直接传入应用三元组，或在 `platforms` 配置中给该三元组命名：

```json
{
  "_platform": {
    "appid": 200079,
    "appname": "com.sing.client",
    "appsign": "3fa2b7951bbf704a052bd2364f3e3ee1"
  }
}
```

此片段与歌曲字段合并后提交。`appsign` 也支持字段名 `app_sign`，可传 `""` 或省略；非空时填写 32 位十六进制应用 hash。

成功：HTTP 200，正文直接是捕获的完整 JSON，没有 `data` 包装，不把 JSON 再编码成带引号的字符串。保留回包未知字段、`extra`、`config` 和 JSON 文本编码。

失败：HTTP 400 参数错误、401 插件鉴权失败、502 平台查询/提交/解析失败、503 没有在线账号或服务关闭、504 等待音卡超时。非 2xx 让 LuckyLillia `sign()` 正常抛错。额外回环服务接受配置的 `path`，同时兼容 `/`、`/sign`、`/api/music/sign`、`/music_card/card`；宿主只挂载配置的 `path`。

GET `<path>` 返回状态，GET `<path>/health` 可做健康检查；额外回环服务也支持 `/health` 和 `/healthz`。GET 带查询参数、表单请求和 `data/params` 一层包装作为兼容入口，推荐 JSON POST。

## 精确复用与缓存

缓存默认启用，保存到插件的 `data/music-card-cache/`。每个请求对应一个 JSON 文件，正文保留捕获音卡的原始 JSON 文本；写入临时文件后原子替换，签名返回前完成保存。重启或重新开启服务后仍可读取。

命中条件是签名账号、实际平台三元组和完整请求字段全部相同。只忽略 JSON 对象的键顺序与 JSON 文本排版；字符串内部空白、URL 原文、数组顺序、值类型、缺省字段和扩展字段均保留。例如 `title: "晴天"` 与 `title: "晴天 "`、省略 `singer` 与 `singer: ""`、数字 ID 与字符串 ID，都分别缓存。标题相同但播放地址或平台不同也不会复用。

ID 请求命中后直接返回上次的音卡，省去歌曲查询和分享提交。缓存按所选在线 icqq 账号隔离。只保存匹配成功的回包；损坏记录会重新签，磁盘读写错误记录到日志。

缓存长期保存。删除对应文件可重新签该请求；清空缓存目录可重新签所有请求。`#音之测测` 每次重新生成音卡，成功后更新对应缓存。

历史音卡保留在磁盘。并发重复请求共用一次查询和提交，操作完成后释放等待记录；账号最后一项请求结束后解绑消息监听器。相同账号、应用 ID 和歌曲内容的不同请求按顺序提交，分别保存各自回包；其它歌曲仍可并行处理。

## 云崽命令和 Handler

以下命令均要求主人权限：

- `#音乐签名状态`：展示开关、配置的签名 Bot、在线账号及等待请求数。
- `#设置音乐签名Bot <QQ号>`：保存签名账号，立即用于后续请求；`bot` 大小写均可，也支持 `#设置音乐签名账号 <QQ号>`。
- `#设置音乐签名Bot 自动`：清除固定账号，恢复自动选择；也可填写 `清除`。
- `#开启音乐签名服务` / `#关闭音乐签名服务`：保存开关并挂载/卸载服务。
- `#音之测测`（也支持不带 `#`）：绕过历史缓存，用 `testMusic` 生成音卡，核对 bot 自己回传的 JSON，并发送到当前会话；成功报告耗时，失败报告生成/回传或发送阶段及原因。
- `#音之测测 {完整请求JSON}`：临时换一首测试歌曲或指定 `_platform`，不修改默认测试配置。
- `#签名音卡 {完整请求JSON}`：优先查找精确缓存，未命中则签名，再向当前会话发送完整 JSON 段。

默认测试歌曲为《晴天》，以 QQ 音乐应用身份提交，可在 `testMusic` 中替换。命令检测音卡生成、回传和当前会话发送；HTTP 服务可由调用方向签名地址发送 POST 检查。

其它插件可通过 Runtime 的 Handler 取得回包原文：

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

API 请求的 `self_id` 或配置的 `botId` 指定生成账号，Handler/命令可回落到当前事件账号。生成账号与接收会话可不同，实际接收协议需支持 JSON 卡片。

## 开发者扩展 ID 查询

从 `lib/models/music-info.js` 导入 `registerMusicResolver(type, resolver)`。`type` 是请求中的歌曲来源名称，`resolver` 使用插件自己的 API 获取歌曲，并返回 `{ title, singer, url, audio, image }`。歌名、歌手、跳转地址和音频地址必需，封面可为空。TS 开发者可从 `lib/types/music.js` 导入 `MusicResolver` 等类型。

例如，将以下注册逻辑合并到开发者插件的 `init()` 中。`myMusicApi` 是该插件已有的 API 客户端，按实际返回字段映射歌曲信息：

```javascript
import { registerMusicResolver } from '../../music-card-sign/lib/models/music-info.js'

// 开发者插件类中的 init 方法
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

HTTP、`music.sign` Handler 和测试命令均可使用同一请求：

```json
{ "type": "my-plugin", "id": "track:00123" }
```

自定义来源默认使用 QQ 音卡身份；加上 `_platform` 可切换应用。注册为 `qq`、`163` 等内置名称时，查询会使用开发者的 API。最近一次注册生效，旧注册的注销函数不会移除新的注册。

解析器接收 `(id, { type, signal, timeoutMs, fetchImpl, json })`。ID 字符串原样传入，自定义解析器自行解释格式。`json(url, params, options)` 和 `fetchImpl(url, options)` 可直接请求 API，沿用查询超时；使用自己的客户端时将 `signal` 传给请求。查询结束后取消剩余请求，查询结果统一检查字段。注册函数返回的注销函数用于释放插件引用。

ID 精确缓存命中时会直接复用上一次的音卡。需要在查询 API 更新后重新生成同一请求，可删除对应缓存，或使用 `#音之测测 {请求JSON}`。
