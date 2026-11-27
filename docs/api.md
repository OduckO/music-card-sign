# 接口文档

[返回 README](../README.md) · [开发指南](development.md)

API 就是供程序调用的接口。准备好歌曲信息后，用 POST 发送 JSON，成功时得到可转发的卡片 JSON。

有歌名和链接时用[自定义歌曲](#自定义歌曲)，只有歌曲 ID 时用 [ID 模式](#id-模式)。`type` 决定去哪查歌曲，`_platform` 决定用哪个应用签名。

## 请求地址

向配置的签名地址发送 POST，使用 `Content-Type: application/json`。

| 服务          | 默认地址                                                            | 支持的路由                                                              |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 云崽宿主 HTTP | `http://127.0.0.1:<云崽端口>/music_card/card`                       | 配置的 `path`                                                           |
| 额外本地服务  | 设置 `localPort: 4567` 后为 `http://127.0.0.1:4567/music_card/card` | 配置的 `path`，以及 `/`、`/sign`、`/api/music/sign`、`/music_card/card` |

额外服务仅监听 `127.0.0.1`。两种服务可同时使用，`path` 应以 `/` 开头且不带结尾斜杠。

签名分享发给配置的 `targetId`，留空发给签名 Bot 自己。生成后，HTTP 响应直接返回卡片原文。联系人设置见 [README](../README.md#安装)。

## 自定义歌曲

已取得歌曲信息时，直接提交歌曲字段：

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

`audio` 和封面都选填。音频可省略、填 `""` 或 `null`，没有音频时可生成图文卡，WebUI 不显示播放按钮。地址直接填 `https://...`，不要写成 Markdown 链接。

图文卡使用 `view: "news"` 和 `meta.news`。服务保留完整回包；省略、空字符串和 `null` 仍是不同请求，分别缓存。

QQ 截断长标题并在末尾添加 `…` 或 `...` 时，服务按原标题前缀匹配，同时核对平台和跳转链接。歌名中的逗号、空格和其他标点不会被拆分。

歌手为空时会按完整歌名搜索，最多等待 0.8 秒；如果配置的回传超时更短，就用更短的时间。网易云、酷狗链接使用对应平台，其他链接使用 QQ 音乐。不要求链接带 ID；有明确 ID 时只用它区分同名歌曲。

只采用完整歌名匹配、能确定歌手的结果。查询失败或结果不明确时继续签名：有音频使用“未知歌手”，没有音频保留空摘要。原有歌曲字段不变，命中缓存时跳过补全。

QQ 可能转存封面，返回的 `preview` 会保留新地址。已知音乐域名的 HTTP 封面和跳转链接会转为 HTTPS。普通音频地址不改；QQ 旧 `fcg_pyq_play.fcg` 地址会尝试读取一次跳转，失败时保留原地址。缓存仍按原始请求区分。

| 字段        | 必需 | 说明                                                          |
| ----------- | ---- | ------------------------------------------------------------- |
| `type`      | 否   | ID 查询来源；直接提交完整歌曲字段时可用 `custom`              |
| `title`     | 是   | 歌曲名                                                        |
| `url`       | 是   | 歌曲跳转地址，HTTP(S) URL                                     |
| `audio`     | 否   | 音频地址，可省略、为空字符串或 `null`；非空时须为 HTTP(S) URL |
| `singer`    | 否   | 歌手；也支持 `content`，优先使用 `singer`                     |
| `image`     | 否   | 封面 HTTP(S) URL，可省略或为空                                |
| `prompt`    | 否   | 分享提示文字，默认 `[分享]` 加歌曲名                          |
| `self_id`   | 否   | 指定生成音卡的 icqq 账号，优先于配置中的 `botId`              |
| `_platform` | 否   | 显式指定音卡平台，优先于跳转链接识别及默认配置                |

HTTP 请求优先用 `self_id`，未传时用配置中的 `botId`。指定账号离线时，改用框架列表中第一个在线 icqq 账号；没有账号可代签时，返回 `503` 并注明离线的 QQ 号。两处都未指定时，只有一个在线 icqq 账号才会自动选择。Handler 和命令还可使用当前事件账号，见[开发指南](development.md#账号平台与发送目标)。

## ID 模式

未提供歌曲名时，可通过来源与 ID 查询歌曲信息，再生成音卡：

```json
{ "type": "163", "id": "186016" }
```

只按 ID 查歌时，不要填写 `title/song/name`。有非空歌名就按完整歌曲请求处理，不会用 ID 补齐缺失字段。

| 查询来源 `type`  | ID 格式                              |
| ---------------- | ------------------------------------ |
| `qq`             | 数字歌曲 ID 或 songmid               |
| `163`            | 网易云数字歌曲 ID                    |
| `kugou`          | 歌曲 hash                            |
| `kuwo`           | 数字歌曲 ID                          |
| `migu`           | 数字歌曲 ID                          |
| 开发者注册的名称 | 由开发者解析，字符串需包含非空白字符 |

`type` 省略时使用 `qq`，名称区分大小写。字符串 ID 原样传入解析器，数字 ID 需为非负安全整数，并转换为十进制字符串；需要保留前导零时使用字符串。

查询至少要得到歌名和跳转链接。没有播放地址时可生成图文卡；歌曲不存在、请求失败或字段不合法时返回错误。自己的 API 可以注册成查询来源，见[扩展 ID 查询](development.md#扩展-id-查询)。

自定义来源名称通过 `type` 传入，例如：

```json
{ "type": "my-plugin", "id": "track:00123" }
```

`my-plugin` 需要由同一云崽进程中的插件注册。服务优先调用 `music.info.<type>` Handler，再找直接注册的函数，最后使用内置来源。名称要完全一致，具体写法见[开发指南](development.md#扩展-id-查询)。

签名平台在查歌前选定：没有跳转链接时用默认平台，有链接时按链接识别，也可用 `_platform` 强制指定。查询结果的链接不会重新选择平台。缓存命中时不再查询。

例如，使用自己的 API 查询 ID，同时强制以默认应用生成音卡：

```json
{ "type": "my-plugin", "id": "track:00123", "_platform": "default" }
```

## 自定义平台

默认平台名是 `default`，appid 为 `102021671`，包名和签名为空。可在锅巴、WebUI 或用 `#设置音乐签名平台 <平台名>` 修改。

平台选择顺序为：`_platform` → `platform` → `source` → 标题中的历史平台标记 → 请求中的歌曲跳转链接 → `defaultPlatform`。其中 `source` 是兼容的平台字段，ID 查询来源使用 `type`。

只识别 `jump`、`jumpUrl`、`url`、`link` 中按此顺序取到的地址；`audio`、`musicUrl` 和封面不参与平台选择。识别按域名及子域名匹配，不访问链接，也不读取查询参数中的其他地址。以下域名及其子域名可自动识别：

| 跳转域名                                 | 平台            |
| ---------------------------------------- | --------------- |
| `y.qq.com`                               | `qq`            |
| `music.163.com`、`163cn.tv`              | `netease`       |
| `kuwo.cn`                                | `kuwo`          |
| `kugou.com`                              | `kugou`         |
| `kugouyouth.com`                         | `kugou_concept` |
| `migu.cn`                                | `migu`          |
| `bilibili.com`、`b23.tv`                 | `bilibili`      |
| `5sing.kugou.com`、`5sing.com`           | `5sing`         |
| `bodian.kuwo.cn`、`bodian-oia.kuwo.cn`   | `bodian`        |
| `tim.qq.com`                             | `tim`           |
| `ys.mihoyo.com`、`genshin.hoyoverse.com` | `yuanshen`      |

更具体的域名优先，例如 `5sing.kugou.com` 使用 `5sing`。未知域名使用默认平台；已知短链接域名按表识别，其他短链接需显式指定 `_platform`。

`default` 使用以下应用信息，将此扩展与歌曲字段合并可强制使用该应用：

```json
{
  "_platform": {
    "appid": 102021671,
    "appname": "",
    "appsign": ""
  }
}
```

例如，从网易云查询歌曲，用默认应用签名：

```json
{ "type": "163", "id": "186016", "_platform": "default" }
```

直接提交歌曲信息时也可指定平台：

```json
{
  "type": "custom",
  "_platform": "kugou_concept",
  "title": "她说",
  "singer": "歌手",
  "url": "https://example.com/song",
  "audio": "https://example.com/audio.mp3"
}
```

预置平台名称为 `default`、`qq`、`netease`（别名 `163`）、`kuwo`、`kugou`、`kugou_concept`、`migu`、`bilibili`、`5sing`、`bodian`、`tim`、`yuanshen`。`qq` 表示 QQ 音乐。

酷狗概念版使用 `_platform: "kugou_concept"`，歌曲 ID 查询仍用 `type: "kugou"`。它的应用信息是 appid `101706348`、appname `com.kugou.android.lite`、appsign `fe4a24d80fcf253a00676a808f62c2c6`。

兼容 shareMusic 的旧标题格式：`晴_天_kugou_concept` 和 `晴_天_*kugou_concept` 都会使用概念版，并把歌名还原为 `晴_天`。

只删除末尾完整匹配的平台标记，支持内置名、`163` 别名和自定义名；多个名称重叠时优先较长的名称。歌名内部的下划线和未知后缀保留。显式平台字段优先于标题标记，不同请求写法仍分别缓存。

### 酷狗概念版链接样本

下面的跳转地址来自实际请求，仍是普通酷狗歌曲页面，两种应用可共用：

```text
https://www.kugou.com/song/#hash=B3A52A7A958BF0AED0EBFBA2E9A818B7
```

同一请求的音频地址采用以下结构，尖括号表示取链接口返回的动态片段：

```text
http://fs.youthandroid2.kugou.com/<日期时间>/<鉴权片段>/v3/<资源片段>/yp/full/<文件名>.mp3
```

`fs.youthandroid2.kugou.com` 也出现在[普通酷狗/VIP 取链记录](https://github.com/Timingyyds/folia-android/blob/f093d04a5a6ab2d126fc4b0eb611f1819af40144/docs/酷狗VIP播放修复说明.md)中，不能只凭这个音频域名选择概念版。音频地址连同协议和动态片段原样传入，不改写为 HTTPS。

[酷狗概念版官网](https://www.kugouyouth.com/)的域名 `kugouyouth.com` 会识别为概念版；普通 `kugou.com/song/` 链接仍识别为酷狗。想用概念版签名，请传 `_platform: "kugou_concept"` 或兼容的标题标记。

### 扩展应用信息

`txqq` 内置平台已移除。可改用 `default`，或直接传入应用信息；显式传入的 appid 不会被替换。

还可直接传入应用信息。将下面片段与歌曲字段合并后提交：

```json
{
  "_platform": {
    "appid": 200079
  }
}
```

`appid` 为必填正整数。`appname` 可省略或为空，非空时填写应用包名；`appsign` 支持别名 `app_sign`，可省略或为空，非空时填写 32 位十六进制应用 hash。省略的 `appname/appsign` 在提交时使用空字符串。

也可在用户配置的 `platforms` 中给同一组应用信息命名，之后通过 `_platform` 引用该名称，或将 `defaultPlatform` 设置为此名称。锅巴支持同时保存平台映射和默认名称。

## 请求鉴权

默认宿主路由沿用云崽已有的 HTTP 鉴权，调用方需携带宿主要求的凭据。额外本地服务可用于独立的本机调用，不经过宿主鉴权。

音卡路径会将宿主鉴权重定向或文本错误转换为 JSON，并保留拒绝状态。JiuLi 尚未就绪时返回 `503`，错误中包含宿主的启动阶段。请求如果返回 HTML，先核对端口、完整路径及插件是否已加载。

配置非空 `apiKey` 后，签名请求和根路由状态查询需要携带以下任一请求头：

```text
Authorization: Bearer <key>
X-API-Key: <key>
```

宿主和插件都使用 `Authorization` 时，该请求头只能携带一个值；可将插件凭据放在 `X-API-Key` 中，同时按宿主要求传入它的凭据。

`/health` 和 `/healthz` 不检查插件 `apiKey`，宿主前置鉴权仍按宿主配置执行。

## 响应与状态查询

成功返回 HTTP `200`，正文就是完整卡片 JSON，没有额外的 `data` 包装。转发时保留原文，不要自己重建卡片。

失败返回非 2xx 状态，正文为 JSON。参数解析成功后会附上本次 `request`。查询、提交和回传错误的实际 HTTP 状态为 `503`，正文中的 `status` 保留具体原因，例如：

```json
{
  "error": "音卡回传字段不匹配：title",
  "status": 502,
  "request": {
    "type": "custom",
    "title": "晴天",
    "singer": "周杰伦",
    "url": "https://music.163.com/#/song?id=186016",
    "audio": "https://music.163.com/song/media/outer/url?id=186016.mp3",
    "image": "https://example.com/cover.jpg"
  },
  "details": { "fields": ["title"] }
}
```

`details.fields` 表示哪些字段没匹配，如歌名 `title` 或提示文字 `prompt`。超时错误的 `status` 为 `504`；鉴权或 JSON 解析失败时只返回 `{ "error": "失败原因" }`。

HTTP 错误日志记录相同的错误与请求体，以及状态和耗时。SDK 错误会提取 `message/msg` 和 `code`，便于定位失败原因。

HTTP 使用 `503` 可减少代理把 `502/504` 正文换成错误网页的情况。仍收到 HTML 时，先直连本地签名地址，再检查代理，不能把 HTML 当成卡片 JSON。

调用方同时检查状态码和内容类型，避免把错误正文当成音卡。Node.js 24 可直接使用 `fetch`；地址字段使用裸 URL：

```javascript
const response = await fetch('https://dy.lyln114514.com/music_card/card', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'custom',
    title: '晴天',
    singer: '周杰伦',
    url: 'https://music.163.com/#/song?id=186016',
    audio: 'https://music.163.com/song/media/outer/url?id=186016.mp3',
    image: 'https://example.com/cover.jpg'
  })
})
const raw = await response.text()
if (!response.headers.get('content-type')?.includes('application/json')) {
  throw new Error(`HTTP ${response.status} 返回非 JSON：${raw.slice(0, 300)}`)
}
const result = JSON.parse(raw)
if (!response.ok) throw new Error(JSON.stringify(result))
console.log(result)
```

| HTTP 状态 | 含义                                           |
| --------- | ---------------------------------------------- |
| `400`     | 参数或 JSON 格式错误                           |
| `401`     | 鉴权失败                                       |
| `404`     | 路由不存在                                     |
| `405`     | 请求方法不支持，使用 POST 或 GET               |
| `413`     | 请求体超过 64 KiB                              |
| `503`     | 没有可用账号、服务关闭，或查询、提交、回传失败 |

失败 JSON 的 `status: 502` 表示查询、提交或回包字段错误，`status: 504` 表示查询或回传超时。两者的实际 HTTP 状态均为 `503`；已有调用方继续使用 `response.ok` 判断是否成功。

不带参数的 GET `<path>` 查询状态，不生成卡片。GET `<path>/health` 检查服务是否可用；额外本地服务也支持 `/health` 和 `/healthz`。

状态包含 `service`、`enabled`、`bots`、`pending`、`targetId`；`targetId` 为空表示发给签名 Bot 自己。要验证真实回传，用 `#音之测测`。

## 兼容字段

推荐使用上述 JSON POST 字段。接口还接受 GET 查询参数、表单和 `data/params` 包装；查询参数与请求体合并时，请求体字段优先。

| 用途         | 字段优先顺序                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| 签名账号     | `self_id`、`bot_id`                                                                 |
| 歌曲名       | `title`、`song`、`name`                                                             |
| 歌手         | `singer`、`artist`、`content`、`desc`                                               |
| 跳转地址     | `jump`、`jumpUrl`、`url`、`link`                                                    |
| 音频地址     | `audio`、`voice`、`musicUrl`                                                        |
| 封面         | `image`、`cover`、`pic`                                                             |
| 音卡应用身份 | `_platform`、`platform`、`source`，缺省按跳转地址识别，未识别时取 `defaultPlatform` |

除账号选择外，兼容字段按表中顺序取第一个非 `null/undefined` 值；空字符串仍算已提供。`type` 不参与音卡平台选择。不同字段名称和包装方式会保留在精确缓存身份中，缓存规则见 [README](../README.md#缓存)。
