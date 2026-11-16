# 接口文档

[返回 README](../README.md) · [开发指南](development.md)

已取得歌曲信息时用[自定义歌曲](#自定义歌曲)请求；只知道歌曲 ID 时用 [ID 模式](#id-模式)。查询来源由 `type` 指定，签名应用由 `_platform` 或默认配置指定，两个字段各自控制不同步骤。

## 请求地址

向配置的签名地址发送 POST，使用 `Content-Type: application/json`。

| 服务          | 默认地址                                                            | 支持的路由                                                              |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 云崽宿主 HTTP | `http://127.0.0.1:<云崽端口>/music_card/card`                       | 配置的 `path`                                                           |
| 额外本地服务  | 设置 `localPort: 4567` 后为 `http://127.0.0.1:4567/music_card/card` | 配置的 `path`，以及 `/`、`/sign`、`/api/music/sign`、`/music_card/card` |

额外服务仅监听 `127.0.0.1`。两种服务可同时使用，`path` 应以 `/` 开头且不带结尾斜杠。

分享目标由插件配置的 `targetId` 指定，留空发给签名 Bot 自己；也可通过锅巴或 `#设置音乐签名联系人 <QQ号>` 设置。HTTP、Handler 和命令共用此目标，生成成功后仍直接返回音卡原文。

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

`audio` 可省略、为空字符串或 `null`，提交分享时使用空字符串。填写非空值时，使用 HTTP(S) 音频地址。封面可省略；填写时使用实际可用的图片地址。所有地址字段填写裸 URL。

空音频回包的 `musicUrl` 可缺省或为空，仍能匹配本次请求。精确缓存保留原始请求的差异，省略 `audio`、`audio: ""` 和 `audio: null` 分别缓存。

QQ 可能将封面转存并改写 `preview`，返回的音卡会保留新地址。音乐平台已知域名的 HTTP 封面和跳转地址会升级为 HTTPS，音频地址保持输入值。缓存按完整原始请求区分，改变封面地址仍会重新签名。

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

HTTP 请求按 `self_id`、配置 `botId`、唯一在线 icqq 账号的顺序选择账号。Handler 和命令还可使用当前事件账号，见 [开发指南](development.md#handler-接入)。

## ID 模式

未提供歌曲名时，可通过来源与 ID 查询歌曲信息，再生成音卡：

```json
{ "type": "163", "id": "186016" }
```

ID 查询在请求包含 `id`，且 `title/song/name` 按此顺序取到的值为空或未提供时执行。只提交 `title` 和 `id` 不会补齐缺少的歌曲字段；已有完整信息时使用上一节的请求。

| 查询来源 `type`  | ID 格式                              |
| ---------------- | ------------------------------------ |
| `qq`             | 数字歌曲 ID 或 songmid               |
| `163`            | 网易云数字歌曲 ID                    |
| `kugou`          | 歌曲 hash                            |
| `kuwo`           | 数字歌曲 ID                          |
| `migu`           | 数字歌曲 ID                          |
| 开发者注册的名称 | 由开发者解析，字符串需包含非空白字符 |

`type` 省略时使用 `qq`，名称区分大小写。字符串 ID 原样传入解析器，数字 ID 需为非负安全整数，并转换为十进制字符串；需要保留前导零时使用字符串。

ID 查询需要取得歌名、歌手、跳转地址和可用音频地址，封面可为空。平台未返回可用播放地址时，请求会失败；其他插件可注册自己的 API 查询来源，也可替换内置查询，见 [扩展 ID 查询](development.md#扩展-id-查询)。

自定义来源名称通过 `type` 传入，例如：

```json
{ "type": "my-plugin", "id": "track:00123" }
```

该来源需先由同一个云崽进程中的开发者插件注册。代码放在开发者自己的插件目录，加载时调用 `registerMusicResolver()`；HTTP 请求中的 `type` 用于选择已注册函数，不会自动加载文件。完整接入方式见 [扩展 ID 查询](development.md#扩展-id-查询)。

签名平台在查询歌曲前确定：ID 请求未携带跳转地址时使用配置的默认平台；携带时按该地址识别平台，`_platform` 可强制指定。解析器返回的 `url` 用于卡片跳转，不会重新选择平台。精确缓存命中时直接返回历史音卡，跳过查询。

例如，使用自己的 API 查询 ID，同时强制以默认应用生成音卡：

```json
{ "type": "my-plugin", "id": "track:00123", "_platform": "default" }
```

## 自定义平台

`defaultPlatform` 默认是 `default`，应用 ID 为 `102021671`，`appname` 和 `appsign` 均为空。可通过锅巴或 `#设置音乐签名平台 <平台名>` 保存默认平台，HTTP、Handler 和命令共用此设置；已有配置可发送 `#设置音乐签名平台 default` 切换。

平台选择顺序为：`_platform` → `platform` → `source` → 请求中的歌曲跳转链接 → `defaultPlatform`。其中 `source` 是兼容的平台字段，ID 查询来源使用 `type`。

只识别 `jump`、`jumpUrl`、`url`、`link` 中按此顺序取到的地址；`audio`、`musicUrl` 和封面不参与平台选择。识别按域名及子域名匹配，不访问链接，也不读取查询参数中的其他地址。以下域名及其子域名可自动识别：

| 跳转域名                                 | 平台       |
| ---------------------------------------- | ---------- |
| `y.qq.com`                               | `qq`       |
| `music.163.com`、`163cn.tv`              | `netease`  |
| `kuwo.cn`                                | `kuwo`     |
| `kugou.com`                              | `kugou`    |
| `migu.cn`                                | `migu`     |
| `bilibili.com`、`b23.tv`                 | `bilibili` |
| `5sing.kugou.com`、`5sing.com`           | `5sing`    |
| `bodian.kuwo.cn`、`bodian-oia.kuwo.cn`   | `bodian`   |
| `tim.qq.com`                             | `tim`      |
| `ys.mihoyo.com`、`genshin.hoyoverse.com` | `yuanshen` |

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

`_platform` 只控制音卡的应用身份，不改变 ID 查询来源。例如，网易云歌曲仍由 `163` 查询，同时以默认应用身份生成卡片：

```json
{ "type": "163", "id": "186016", "_platform": "default" }
```

直接提交歌曲信息时也可指定平台：

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

预置平台名称为 `default`、`qq`、`netease`（别名 `163`）、`kuwo`、`kugou`、`migu`、`bilibili`、`5sing`、`bodian`、`tim`、`yuanshen`。`qq` 表示 QQ 音乐。

内置 QQ 本体平台 `txqq` 已移除。调用方使用 `_platform: "default"` 可强制使用默认应用；直接传入应用对象时仍使用指定的 `appid`，不会替换为默认应用。

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

成功响应为 HTTP 200，正文直接是捕获的完整音卡 JSON 原文，不加 `data` 包装，也不再次编码成 JSON 字符串。保留回包未知字段、`extra`、`config` 和原始 JSON 文本编码。

音卡路径的失败响应使用非 2xx 状态，`Content-Type` 为 `application/json`。请求解析成功后，失败响应附上本次请求。提交、查询或回传失败通过 HTTP `503` 返回，JSON 的 `status` 保留内部 `502/504`。已确认属于本次请求的回包若歌手或音频不匹配，会立即返回，例如：

```json
{
  "error": "音卡回传字段不匹配：musicUrl",
  "status": 502,
  "request": {
    "type": "custom",
    "title": "晴天",
    "singer": "周杰伦",
    "url": "https://music.163.com/#/song?id=186016",
    "audio": "https://music.163.com/song/media/outer/url?id=186016.mp3",
    "image": "https://example.com/cover.jpg"
  },
  "details": { "fields": ["musicUrl"] }
}
```

`details.fields` 列出未匹配的回包字段：`desc` 对应歌手，`musicUrl` 对应音频。未收到本次请求的回包时，等待达到 `timeoutMs` 后返回 HTTP `503`，JSON 的 `status` 为 `504`，并附上请求。鉴权或 JSON 解析失败时，正文为 `{ "error": "失败原因" }`。

HTTP 最后一条错误日志包含与响应相同的错误和请求体；响应日志记录实际 HTTP 状态及耗时。SDK 抛出的对象错误会提取 `message/msg` 和 `code`，例如 `音卡提交失败：Request failed with status code 530 (code=-1)`。

插件用 `503` 传递内部 `502/504` 的业务错误，减少代理将正文替换为错误页的情况。域名返回 HTML 时，先在运行机器上直接请求本地签名地址，检查响应状态和 `Content-Type`，再对照代理日志。

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

不带查询参数的 GET `<path>` 返回服务状态，GET `<path>/health` 用于健康检查；额外服务也支持 `/health` 和 `/healthz`。状态包含 `service`、`enabled`、`bots`、`pending`、`targetId`；`targetId` 为空表示发给各自签名 Bot。查询状态不会生成音卡。检查实际回传可使用 `#音之测测`。

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
