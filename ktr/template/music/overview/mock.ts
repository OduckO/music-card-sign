import type { OverviewData } from '../../../../src/modules/music-card-sign/help-data'

export default {
  title: '音卡状态',
  rows: [
    ['音卡签名服务', '开启'],
    ['签名 Bot', '自动选择'],
    ['接收联系人', '签名 Bot 自己'],
    ['默认签名平台', 'kugou_concept'],
    ['在线 icqq', '123456789'],
    ['等待请求', '0'],
    ['宿主路径', '/music_card/card'],
    ['本地端口', '使用云崽现有 HTTP 端口'],
    ['回传超时', '15000 ms'],
    ['API Key', '已设置']
  ]
} satisfies OverviewData
