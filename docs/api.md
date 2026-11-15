# 接口文档

[返回 README](../README.md) · [开发指南](development.md)

## 请求地址

向配置的签名地址发送 POST，使用 `Content-Type: application/json`。

| 服务          | 默认地址                                                            | 支持的路由                                                              |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 云崽宿主 HTTP | `http://127.0.0.1:<云崽端口>/music_card/card`                       | 配置的 `path`                                                           |
| 额外本地服务  | 设置 `localPort: 4567` 后为 `http://127.0.0.1:4567/music_card/card` | 配置的 `path`，以及 `/`、`/sign`、`/api/music/sign`、`/music_card/card` |

额外服务仅监听 `127.0.0.1`。两种服务可同时使用，`path` 应以 `/` 开头且不带结尾斜杠。

分享目标由插件配置的 `targetId` 指定，留空发给签名 Bot 自己；也可通过锅巴或 `#设置音乐签名联系人 <QQ号>` 设置。HTTP、Handler 和命令共用此目标，生成成功后仍直接返回音卡原文。

## 自定义歌曲

已取得歌曲信息时，直接提交完整字段：

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

示例封面需替换为实际可用地址，音频地址也应由调用方确认可用。

| 字段        | 必需 | 说明                                                  |
| ----------- | ---- | ----------------------------------------------------- |
| `type`      | 否   | `custom` 默认使用 QQ 音乐应用身份；其他平台名称见下文 |
| `title`     | 是   | 歌曲名                                                |
| `url`       | 是   | 歌曲跳转地址，HTTP(S) URL                             |
| `audio`     | 是   | 音频地址，HTTP(S) URL                                 |
| `singer`    | 否   | 歌手；也支持 `content`，优先使用 `singer`             |
| `image`     | 否   | 封面 HTTP(S) URL，可省略或为空                        |
| `prompt`    | 否   | 分享提示文字，默认 `[分享]` 加歌曲名                  |
| `self_id`   | 否   | 指定生成音卡的 icqq 账号，优先于配置中的 `botId`      |
| `_platform` | 否   | 隐藏扩展，指定音卡的应用身份                          |

HTTP 请求按 `self_id`、配置 `botId`、唯一在线 icqq 账号的顺序选择账号。Handler 和命令还可使用当前事件账号，见 [开发指南](development.md#handler-接入)。

## ID 模式

未提供歌曲名时，可通过来源与 ID 查询歌曲信息，再生成音卡：

```json
{ "type": "163", "id": "186016" }
```

内置来源为 `qq`、`163`、`kugou`、`kuwo`、`migu`。QQ 支持数字 ID 或 songmid，酷狗使用歌曲 hash。ID 字符串原样保留；需要保留前导零时使用字符串。

ID 查询需要取得歌名、歌手、跳转地址和可用音频地址，封面可为空。平台未返回可用播放地址时，请求会失败；其他插件可注册自己的 API 查询来源，也可替换内置查询，见 [扩展 ID 查询](development.md#扩展-id-查询)。

自定义来源名称通过 `type` 传入，例如：

```json
{ "type": "my-plugin", "id": "track:00123" }
```

该来源需要先由插件注册。自定义来源默认使用 QQ 音乐应用身份，可通过 `_platform` 切换；精确缓存命中时会直接返回历史音卡，跳过查询。

## 自定义平台

`_platform` 只控制音卡的应用身份，不改变 ID 查询来源。例如，网易云歌曲仍由 `163` 查询，同时以 QQ 音乐应用身份生成卡片：

```json
{ "type": "163", "id": "186016", "_platform": "qq" }
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

预置平台名称为 `qq`、`netease`（别名 `163`）、`kuwo`、`kugou`、`migu`、`bilibili`、`5sing`、`bodian`、`tim`、`yuanshen`。

还可直接传入应用信息。将下面片段与歌曲字段合并后提交：

```json
{
  "_platform": {
    "appid": 200079,
    "appname": "com.sing.client",
    "appsign": "3fa2b7951bbf704a052bd2364f3e3ee1"
  }
}
```

`appid` 为正整数，`appname` 为应用包名。`appsign` 支持别名 `app_sign`，可传 `""` 或省略；非空时填写 32 位十六进制应用 hash。

也可在用户配置的 `platforms` 中给同一组应用信息命名，之后通过 `_platform` 引用该名称。

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

音卡路径的失败响应使用非 2xx 状态，`Content-Type` 为 `application/json`，正文为：

```json
{ "error": "失败原因" }
```

宿主前置 JSON 解析失败同样返回 JSON。日志会记录 HTTP 入口、签名阶段、错误详情及响应状态；参数和歌曲查询错误不会跳转到网页。

Cloudflare `524` 页面由代理生成，表示源站未及时响应。在运行机器上直接 GET 完整签名地址，对照「宿主入口收到」和「响应」日志确认请求是否进入插件。

| HTTP 状态 | 含义                             |
| --------- | -------------------------------- |
| `400`     | 参数或 JSON 格式错误             |
| `401`     | 鉴权失败                         |
| `404`     | 路由不存在                       |
| `405`     | 请求方法不支持，使用 POST 或 GET |
| `413`     | 请求体超过 64 KiB                |
| `502`     | 歌曲查询、分享提交或解析失败     |
| `503`     | 没有可用在线账号或服务未开启     |
| `504`     | 查询或等待回传超时               |

不带查询参数的 GET `<path>` 返回服务状态，GET `<path>/health` 用于健康检查；额外服务也支持 `/health` 和 `/healthz`。状态包含 `service`、`enabled`、`bots`、`pending`、`targetId`；`targetId` 为空表示发给各自签名 Bot。查询状态不会生成音卡。检查实际回传可使用 `#音之测测`。

## 兼容字段

推荐使用上述 JSON POST 字段。接口还接受 GET 查询参数、表单和 `data/params` 包装；查询参数与请求体合并时，请求体字段优先。

| 用途         | 字段优先顺序                              |
| ------------ | ----------------------------------------- |
| 签名账号     | `self_id`、`bot_id`                       |
| 歌曲名       | `title`、`song`、`name`                   |
| 歌手         | `singer`、`artist`、`content`、`desc`     |
| 跳转地址     | `jump`、`jumpUrl`、`url`、`link`          |
| 音频地址     | `audio`、`voice`、`musicUrl`              |
| 封面         | `image`、`cover`、`pic`                   |
| 音卡应用身份 | `_platform`、`platform`、`source`、`type` |

除账号选择外，兼容字段按表中顺序取第一个非 `null/undefined` 值；空字符串仍算已提供。不同字段名称和包装方式会保留在精确缓存身份中，缓存规则见 [README](../README.md#缓存)。
