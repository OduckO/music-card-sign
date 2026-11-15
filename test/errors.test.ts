import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage } from '../src/utils/errors'

test('SDK 的对象错误保留 message/msg 和 code，普通 Error 及字符串保持原信息', () => {
  class ApiRejection {
    constructor(
      public code: number,
      public message: string
    ) {}
  }
  const message = 'Request failed with status code 530'
  assert.equal(errorMessage(new ApiRejection(-1, message)), `${message} (code=-1)`)
  assert.equal(errorMessage({ code: -1, msg: message }), `${message} (code=-1)`)
  assert.equal(errorMessage({ message }), message)
  assert.equal(errorMessage(new Error(message)), message)
  assert.equal(errorMessage(message), message)
})

test('缺少消息字段的对象可显示 JSON，循环对象不会让错误处理再次抛错', () => {
  assert.equal(errorMessage({ code: 123, reason: '失败' }), '{"code":123,"reason":"失败"}')
  const circular: Record<string, unknown> = {}
  circular.self = circular
  assert.doesNotThrow(() => errorMessage(circular))
})
