# 音卡签名插件

源码采用 KaguyaJs/Yunzai-Plugin-Example-TS 模板：根 index.js 加载 lib/index.js，src/index.ts 经 modules/loader 加载应用，src/config 使用云崽 makeConfig，默认配置位于 resources/config/config.yaml。

src/models 保留签名、ID 查询、精确缓存和 HTTP 四个模块；src/types 公开请求、歌曲信息、平台和扩展解析器类型。tsc && tsc-alias 输出严格检查后的 JS 与类型声明，别名转换为相对 .js 导入。

签名账号通过 ICQQ-Plugin 接入，icqq 版本要求：@icqqjs/icqq 1.10.3。HTTP 兼容 LuckyLilliaBot 的 sign.ts，捕获的完整 JSON 原文供 HTTP、Handler 和命令使用。自定义平台支持空 appsign / app_sign，ID 来源可由其它插件注册解析器。

成功音卡继续使用 data/music-card-cache/。命中要求账号、应用三元组和完整请求相同，只忽略 JSON 对象键序和排版。普通请求优先读缓存，#音之测测 强制重新生成。活跃任务结束后删除等待记录并解绑监听器，关闭和重启等待旧写入结束。

首次升级在 YAML 不存在时迁移旧 JSON 配置并保留原文件。配置存放在云崽根目录 config/music-card-sign.yaml。主人可以设置签名 Bot、开关服务、查看状态和测试音卡。

main 保存源码，GitHub Actions 执行类型检查、lint、构建与编译产物的离线测试，再将运行文件发布到 lib 分支及 music-card-sign-js 产物。安装 lib 分支无需本地 TS 编译。
