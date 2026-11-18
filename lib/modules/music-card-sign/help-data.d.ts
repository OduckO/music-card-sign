export interface HelpData {
    path: string;
    defaultPlatform: string;
}
export interface OverviewData {
    title: string;
    message?: string;
    rows: Array<[
        label: '音卡签名服务' | '签名 Bot' | '接收联系人' | '默认签名平台' | '在线 icqq' | '等待请求' | '宿主路径' | '本地端口' | '回传超时' | 'API Key',
        value: string
    ]>;
}
export declare const helpGroups: readonly [{
    readonly title: "测试与发卡";
    readonly subtitle: "检查回传，或发送指定歌曲";
    readonly commands: readonly [readonly ["#音之测测", "重新签名测试歌曲，并发送到当前会话"], readonly ["#音之测测 {请求JSON}", "临时指定歌曲，检查签名与回传"], readonly ["#签名音卡 {请求JSON}", "签名并发卡；完全相同的请求复用缓存"]];
}, {
    readonly title: "服务设置";
    readonly subtitle: "选择账号、联系人与默认平台";
    readonly commands: readonly [readonly ["#音乐签名状态", "查看服务与配置；API Key 仅显示是否设置"], readonly ["#设置音乐签名Bot <QQ号>", "选择 icqq 账号；填「自动」恢复自动选择"], readonly ["#设置音乐签名联系人 <QQ号>", "指定收卡联系人；填「自己」恢复发给自己"], readonly ["#设置音乐签名平台 <平台名>", "内置或自定义平台，如 default、kugou_concept"], readonly ["#开启音乐签名服务 / #关闭音乐签名服务", "开启或关闭本地音卡签名接口"]];
}, {
    readonly title: "更新维护";
    readonly subtitle: "保持插件与编译产物同步";
    readonly commands: readonly [readonly ["#音乐签名更新", "获取插件更新"], readonly ["#音乐签名强制更新", "覆盖本地代码修改后更新"], readonly ["#音乐签名更新日志", "查看最近的更新记录"]];
}];
