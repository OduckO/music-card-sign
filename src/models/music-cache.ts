import type { CacheRecord, NormalizedRequest } from '@/types'
import { errorCode } from '@/utils'
import fs from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export class MusicCardCache {
  readonly directory: string
  constructor (directory: string | URL) {
    this.directory = directory instanceof URL ? fileURLToPath(directory) : resolve(directory)
  }

  path (key: string) {
    return join(this.directory, createHash('sha256').update(key).digest('hex') + '.json')
  }

  async get (key: string): Promise<CacheRecord | null> {
    let text
    try { text = await fs.readFile(this.path(key), 'utf8') } catch (error) {
      if (errorCode(error) === 'ENOENT') return null
      throw error
    }
    const record = JSON.parse(text)
    if (record?.version !== 1 || record.key !== key) return null
    if (typeof record.raw !== 'string' || !record.request) throw new Error('音卡缓存记录不完整')
    return record
  }

  async set (key: string, raw: string, request: NormalizedRequest): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true })
    const path = this.path(key)
    const temporary = path + '.' + randomUUID() + '.tmp'
    try {
      await fs.writeFile(temporary, JSON.stringify({ version: 1, key, request, raw }), 'utf8')
      await fs.rename(temporary, path)
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }
}
