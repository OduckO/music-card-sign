import assert from 'node:assert/strict'
import test from 'node:test'
import type { MusicFetch, MusicInfo, MusicResolver, ResolveMusic } from '../src/types'

async function resolve(...args: Parameters<ResolveMusic>) {
  let module
  try {
    module = await import('../src/models/music-info')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail('music-info.js must implement resolveMusicInfo before these fixtures can pass')
    }
    throw error
  }
  assert.equal(typeof module.resolveMusicInfo, 'function')
  return module.resolveMusicInfo(...args)
}

interface FixtureStep<Data = unknown> {
  check: (url: URL, options: RequestInit) => void
  data: Data
  status?: number
}

function fixtures(steps: readonly FixtureStep[]) {
  const pending = [...steps]
  return {
    fetchImpl: async (input: string | URL, options: RequestInit = {}) => {
      const step = pending.shift()
      assert.ok(step, `Unexpected network request: ${input}`)
      const url = new URL(input)
      assert.ok(['http:', 'https:'].includes(url.protocol))
      assert.ok(options.signal instanceof AbortSignal, 'Every request must have a timeout signal')
      step.check(url, options)
      return new Response(JSON.stringify(step.data), {
        status: step.status ?? 200,
        headers: { 'Content-Type': 'application/json' }
      })
    },
    done: () => assert.equal(pending.length, 0, 'All fixture requests must be consumed')
  }
}

function get<Data>(
  host: string,
  pathname: string,
  params: Record<string, string>,
  data: Data
): FixtureStep<Data> {
  return {
    check: (url, options) => {
      assert.equal(options.method ?? 'GET', 'GET')
      assert.equal(url.hostname, host)
      assert.equal(url.pathname, pathname)
      for (const [key, value] of Object.entries(params)) {
        assert.equal(url.searchParams.get(key), value)
      }
    },
    data
  }
}

const qqTrack = {
  id: 123,
  mid: '00Track9',
  title: '离线歌曲',
  singer: [
    { id: 1, name: '甲' },
    { id: 2, name: '乙' }
  ],
  album: { id: 5, mid: '00Album9', title: '离线专辑' }
}

function qqSteps(id: string, audio = 'C40000Track9.m4a?vkey=fixture') {
  const key = /^\d+$/.test(id) ? 'songid' : 'songmid'
  return [
    get(
      'c.y.qq.com',
      '/v8/fcg-bin/fcg_play_single_song.fcg',
      {
        [key]: id,
        format: 'json'
      },
      { code: 0, data: [qqTrack] }
    ),
    {
      check: (url, options) => {
        assert.equal(url.href, 'https://u.y.qq.com/cgi-bin/musicu.fcg')
        assert.equal(options.method, 'POST')
        assert.equal(typeof options.body, 'string')
        const body = JSON.parse(options.body as string)
        assert.equal(body.req_0.module, 'vkey.GetVkeyServer')
        assert.equal(body.req_0.method, 'CgiGetVkey')
        assert.deepEqual(body.req_0.param.songmid, ['00Track9'])
      },
      data: {
        code: 0,
        req_0: {
          code: 0,
          data: {
            sip: ['https://stream.qqmusic.qq.com/'],
            midurlinfo: [
              { songmid: 'unrelated', purl: 'wrong.m4a' },
              {
                songmid: '00Track9',
                purl: audio
              }
            ]
          }
        }
      }
    } satisfies FixtureStep
  ] as const
}

function neteaseSteps(audio: string | null = 'https://audio.example.test/163.mp3') {
  return [
    get(
      'music.163.com',
      '/api/song/detail',
      { ids: '["00123"]' },
      {
        code: 200,
        songs: [
          {
            id: 123,
            name: '网易歌曲',
            artists: [{ name: '网易歌手' }],
            album: { picUrl: '//image.example.test/163.jpg' }
          }
        ]
      }
    ),
    get(
      'music.163.com',
      '/api/song/enhance/player/url',
      {
        ids: '["00123"]',
        br: '128000'
      },
      {
        code: 200,
        data: [
          { id: 999, code: 200, url: 'https://audio.example.test/wrong.mp3' },
          {
            id: 123,
            code: 200,
            url: audio
          }
        ]
      }
    )
  ] as const
}

function kugouSteps(audio: string | null = 'https://audio.example.test/kugou.mp3') {
  return [
    get(
      'm.kugou.com',
      '/app/i/getSongInfo.php',
      {
        cmd: 'playInfo',
        hash: '00AbC9'
      },
      {
        status: 1,
        hash: '00AbC9',
        songName: '酷狗歌曲',
        singerName: '酷狗歌手',
        url: audio,
        imgUrl: 'https://image.example.test/{size}/kugou.jpg'
      }
    )
  ]
}

function kuwoSteps(audio: string | null = 'https://audio.example.test/kuwo.mp3') {
  return [
    get(
      'www.kuwo.cn',
      '/api/www/music/musicInfo',
      { mid: '00123' },
      {
        code: 200,
        data: {
          rid: 123,
          name: '酷我歌曲',
          artist: '酷我歌手',
          pic: 'https://image.example.test/kuwo.jpg'
        }
      }
    ),
    get(
      'www.kuwo.cn',
      '/api/v1/www/music/playUrl',
      {
        mid: '00123',
        type: 'convert_url',
        httpsStatus: '1'
      },
      { code: 200, data: { url: audio } }
    )
  ]
}

function miguSteps(audio: string | null = 'https://audio.example.test/migu.mp3') {
  return [
    get(
      'music.migu.cn',
      '/v3/api/music/audioPlayer/getSongInfo',
      {
        copyrightId: '00123'
      },
      {
        returnCode: '000000',
        songItem: {
          copyrightId: '00123',
          songName: '咪咕歌曲',
          singer: '咪咕歌手',
          mp3: audio,
          img: '//image.example.test/migu.jpg'
        }
      }
    )
  ]
}

const cases = [
  {
    type: 'qq',
    id: '00Track9',
    steps: () => qqSteps('00Track9'),
    want: {
      title: '离线歌曲',
      singer: '甲 / 乙',
      url: 'https://y.qq.com/n/ryqq/songDetail/00Track9',
      audio: 'https://stream.qqmusic.qq.com/C40000Track9.m4a?vkey=fixture',
      image: 'https://y.gtimg.cn/music/photo_new/T002R300x300M00000Album9.jpg'
    }
  },
  {
    type: '163',
    id: '00123',
    steps: neteaseSteps,
    want: {
      title: '网易歌曲',
      singer: '网易歌手',
      url: 'https://music.163.com/song?id=00123',
      audio: 'https://audio.example.test/163.mp3',
      image: 'https://image.example.test/163.jpg'
    }
  },
  {
    type: 'kugou',
    id: '00AbC9',
    steps: kugouSteps,
    want: {
      title: '酷狗歌曲',
      singer: '酷狗歌手',
      url: 'https://www.kugou.com/song/#hash=00AbC9',
      audio: 'https://audio.example.test/kugou.mp3',
      image: 'https://image.example.test/400/kugou.jpg'
    }
  },
  {
    type: 'kuwo',
    id: '00123',
    steps: kuwoSteps,
    want: {
      title: '酷我歌曲',
      singer: '酷我歌手',
      url: 'https://www.kuwo.cn/play_detail/00123',
      audio: 'https://audio.example.test/kuwo.mp3',
      image: 'https://image.example.test/kuwo.jpg'
    }
  },
  {
    type: 'migu',
    id: '00123',
    steps: miguSteps,
    want: {
      title: '咪咕歌曲',
      singer: '咪咕歌手',
      url: 'https://music.migu.cn/v3/music/song/00123',
      audio: 'https://audio.example.test/migu.mp3',
      image: 'https://image.example.test/migu.jpg'
    }
  }
] satisfies Array<{
  type: string
  id: string
  steps: (audio?: string | null) => readonly FixtureStep[]
  want: MusicInfo
}>

for (const entry of cases) {
  test(`${entry.type}: official response chain returns real metadata and audio`, async () => {
    const fixture = fixtures(entry.steps())
    assert.deepEqual(await resolve(entry.type, entry.id, fixture), entry.want)
    fixture.done()
  })

  test(`${entry.type}: absent audio preserves metadata without manufacturing a playback URL`, async () => {
    const fixture = fixtures(entry.type === 'qq' ? qqSteps(entry.id, '') : entry.steps(null))
    assert.deepEqual(await resolve(entry.type, entry.id, fixture), { ...entry.want, audio: '' })
    fixture.done()
  })

  test(`${entry.type}: resolver override receives the unchanged ID and validates output`, async () => {
    const info = await resolve(entry.type, entry.id, {
      fetchImpl: () => assert.fail('An override must replace the official chain'),
      resolvers: {
        [entry.type]: async (id, context) => {
          assert.equal(id, entry.id)
          assert.equal(context.type, entry.type)
          assert.equal(context.timeoutMs, 8000)
          assert.ok(context.signal instanceof AbortSignal)
          return { ...entry.want, unused: 'must not leak to the main service' }
        }
      }
    })
    assert.deepEqual(info, entry.want)
  })
}

test('QQ numeric ID retains leading zeroes in the detail request', async () => {
  const fixture = fixtures(qqSteps('00123'))
  assert.deepEqual(await resolve('qq', '00123', fixture), cases[0].want)
  fixture.done()
})

test('non-negative safe numeric IDs are supplied to overrides as decimal strings', async () => {
  for (const id of [0, 123]) {
    await resolve('163', id, {
      resolvers: {
        163: async (value) => {
          assert.equal(value, String(id))
          return cases[1].want
        }
      }
    })
  }
})

test('invalid types and IDs fail before any network access', async () => {
  const options = { fetchImpl: () => assert.fail('Invalid input must not perform I/O') }
  await assert.rejects(resolve('custom', '123', options), { code: 'ERR_MUSIC_PLATFORM' })
  for (const id of [
    '',
    ' 00123',
    '00123 ',
    '1.5',
    '-1',
    '1&x=2',
    'https://example.test',
    {},
    null,
    1.5,
    -1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    await assert.rejects(resolve('163', id as string | number, options), { code: 'ERR_MUSIC_ID' })
  }
  await assert.rejects(resolve('migu', '00Ab9', options), { code: 'ERR_MUSIC_ID' })
  await assert.rejects(resolve('qq', '00_a', options), { code: 'ERR_MUSIC_ID' })
})

test('unsafe URL schemes in resolver output are rejected', async () => {
  for (const field of ['url', 'audio', 'image']) {
    for (const value of [
      'file:///tmp/audio',
      'data:audio/mpeg;base64,AAAA',
      'javascript:alert(1)',
      '/relative',
      'https:missing-slashes'
    ]) {
      await assert.rejects(
        resolve('163', '00123', {
          resolvers: { 163: async () => ({ ...cases[1].want, [field]: value }) }
        }),
        { code: 'ERR_MUSIC_URL' }
      )
    }
  }
})

test('missing title fails; singer, audio and cover may be absent', async () => {
  for (const field of ['title']) {
    await assert.rejects(
      resolve('163', '00123', {
        resolvers: { 163: async () => ({ ...cases[1].want, [field]: '' }) }
      }),
      { code: 'ERR_MUSIC_METADATA' }
    )
  }
  const info = await resolve('163', '00123', {
    resolvers: {
      163: async () => ({ title: cases[1].want.title, url: cases[1].want.url })
    }
  })
  assert.equal(info.singer, '')
  assert.equal(info.audio, '')
  assert.equal(info.image, '')
})

test('HTTP failure and malformed JSON have distinct useful errors', async () => {
  const steps = neteaseSteps()
  steps[0].status = 403
  await assert.rejects(resolve('163', '00123', fixtures([steps[0]])), {
    code: 'ERR_MUSIC_HTTP',
    status: 403
  })
  await assert.rejects(
    resolve('163', '00123', {
      fetchImpl: async () => new Response('<html>blocked</html>')
    }),
    { code: 'ERR_MUSIC_RESPONSE' }
  )
})

test('platform error responses and unrelated songs are not used as metadata', async () => {
  const denied = neteaseSteps()
  denied[0].data = { code: 403, songs: [] }
  await assert.rejects(resolve('163', '00123', fixtures([denied[0]])), {
    code: 'ERR_MUSIC_RESPONSE'
  })
  const wrong = neteaseSteps()
  wrong[0].data.songs[0].id = 999
  await assert.rejects(resolve('163', '00123', fixtures([wrong[0]])), {
    code: 'ERR_MUSIC_METADATA'
  })
})

test('QQ relative audio requires a real HTTP(S) stream origin from the response', async () => {
  const steps = qqSteps('00Track9')
  steps[1].data.req_0.data.sip = []
  assert.equal((await resolve('qq', '00Track9', fixtures(steps))).audio, '')
  const unsafe = qqSteps('00Track9')
  unsafe[1].data.req_0.data.sip = ['file:///tmp/']
  await assert.rejects(resolve('qq', '00Track9', fixtures(unsafe)), { code: 'ERR_MUSIC_URL' })
})

test('network rejection preserves its cause', async () => {
  const cause = new Error('offline fixture')
  await assert.rejects(
    resolve('163', '00123', {
      fetchImpl: async () => {
        throw cause
      }
    }),
    (error: NodeJS.ErrnoException) => error.code === 'ERR_MUSIC_NETWORK' && error.cause === cause
  )
})

test('timeout aborts fetch and does not depend on fetch observing the abort', async () => {
  let signal: AbortSignal | null | undefined
  await assert.rejects(
    resolve('163', '00123', {
      timeoutMs: 15,
      fetchImpl: async (_, options) => {
        signal = options?.signal
        return new Promise<Response>(() => {})
      }
    }),
    { code: 'ERR_MUSIC_TIMEOUT' }
  )
  assert.equal(signal?.aborted, true)
})

test('timeout also bounds response-body reads and custom resolvers', async () => {
  await assert.rejects(
    resolve('163', '00123', {
      timeoutMs: 15,
      fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response
    }),
    { code: 'ERR_MUSIC_TIMEOUT' }
  )
  await assert.rejects(
    resolve('migu', '00123', {
      timeoutMs: 15,
      resolvers: { migu: async () => new Promise<MusicInfo>(() => {}) }
    }),
    { code: 'ERR_MUSIC_TIMEOUT' }
  )
})

test('custom resolver requests use the same timeout and URL restrictions', async () => {
  await assert.rejects(
    resolve('163', '00123', {
      fetchImpl: () => assert.fail('A non-HTTP URL must not reach fetch'),
      resolvers: {
        163: async (id, { fetchImpl }) => {
          await fetchImpl('file:///tmp/song')
          return cases[1].want
        }
      }
    }),
    { code: 'ERR_MUSIC_URL' }
  )
  let signal: AbortSignal | null | undefined
  await assert.rejects(
    resolve('163', '00123', {
      timeoutMs: 15,
      fetchImpl: async (_, options) => {
        signal = options?.signal
        return new Promise<Response>(() => {})
      },
      resolvers: {
        163: async (id, { fetchImpl }) => {
          await fetchImpl(`https://example.test/song/${id}`)
          return cases[1].want
        }
      }
    }),
    { code: 'ERR_MUSIC_TIMEOUT' }
  )
  assert.equal(signal?.aborted, true)
})

test('invalid options fail explicitly instead of disabling timeouts or overrides', async () => {
  for (const timeoutMs of [0, -1, Infinity, NaN, '8000', 2147483648]) {
    await assert.rejects(resolve('163', '00123', { timeoutMs: timeoutMs as number }), {
      code: 'ERR_MUSIC_OPTIONS'
    })
  }
  await assert.rejects(
    resolve('qq', '00Track9', { resolvers: { qq: null as unknown as MusicResolver } }),
    {
      code: 'ERR_MUSIC_OPTIONS'
    }
  )
  await assert.rejects(resolve('163', '00123', { fetchImpl: null as unknown as MusicFetch }), {
    code: 'ERR_MUSIC_OPTIONS'
  })
})

test('插件注册自己的歌曲来源，接收原始 ID 和超时上下文', async (t) => {
  const { registerMusicResolver } = await import('../src/models/music-info')
  assert.equal(typeof registerMusicResolver, 'function')
  const dispose = registerMusicResolver('my-music', async (id, context) => {
    assert.equal(id, 'track:00012/a')
    assert.equal(context.type, 'my-music')
    assert.ok(context.signal instanceof AbortSignal)
    assert.equal(typeof context.json, 'function')
    return cases[1].want
  })
  t.after(dispose)
  assert.deepEqual(await resolve('my-music', 'track:00012/a'), cases[1].want)
  dispose()
  await assert.rejects(resolve('my-music', 'track:00012/a'), { code: 'ERR_MUSIC_PLATFORM' })
})

test('旧插件的注销函数不会移除后来注册的解析器，内置来源也可覆盖', async (t) => {
  const { registerMusicResolver } = await import('../src/models/music-info')
  assert.equal(typeof registerMusicResolver, 'function')
  const old = registerMusicResolver('163', async () => assert.fail('旧解析器应被替换'))
  const current = registerMusicResolver('163', async () => cases[1].want)
  t.after(current)
  old()
  assert.deepEqual(await resolve('163', 'private:00123'), cases[1].want)
})

test('注册解析器仍检查完整歌曲信息，并在超时后中止信号', async (t) => {
  const { registerMusicResolver } = await import('../src/models/music-info')
  assert.equal(typeof registerMusicResolver, 'function')
  let signal: AbortSignal | undefined
  const slow = registerMusicResolver('slow-plugin', async (id, context) => {
    signal = context.signal
    return new Promise<MusicInfo>(() => {})
  })
  const incomplete = registerMusicResolver(
    'incomplete-plugin',
    async () => ({ title: '仅有标题' }) as MusicInfo
  )
  t.after(slow)
  t.after(incomplete)
  await assert.rejects(resolve('incomplete-plugin', '00123'), { code: 'ERR_MUSIC_URL' })
  await assert.rejects(resolve('slow-plugin', '00123', { timeoutMs: 15 }), {
    code: 'ERR_MUSIC_TIMEOUT'
  })
  assert.equal(signal?.aborted, true)
})

test('metadata-only queries reuse song detail and never request playback URLs', async () => {
  for (const entry of cases) {
    const fixture = fixtures([entry.steps()[0]])
    const info = await resolve(entry.type, entry.id, { ...fixture, metadataOnly: true })
    assert.deepEqual(info, { ...entry.want, audio: '' })
    fixture.done()
  }
})

test('网易云没有授权播放的记录仍可返回图文分享信息', async () => {
  const steps = neteaseSteps()
  steps[1].data.data[1].code = 403
  assert.deepEqual(await resolve('163', '00123', fixtures(steps)), {
    ...cases[1].want,
    audio: ''
  })
})

test('歌手补全仅从已知歌曲页面提取 ID，不使用歌名、音频或任意网站参数', async () => {
  const { musicIdFromUrl } = await import('../src/models/music-info')
  for (const [url, type, id] of [
    ['https://music.163.com/#/song?id=186016', '163', '186016'],
    ['https://music.163.com/song?id=00123', '163', '00123'],
    ['https://y.qq.com/n/ryqq/songDetail/00Track9', 'qq', '00Track9'],
    ['https://y.qq.com/n/yqq/song/00Track9.html', 'qq', '00Track9'],
    ['https://i.y.qq.com/v8/playsong.html?songmid=00Track9', 'qq', '00Track9'],
    [
      'https://www.kugou.com/song/#hash=B3A52A7A958BF0AED0EBFBA2E9A818B7',
      'kugou',
      'B3A52A7A958BF0AED0EBFBA2E9A818B7'
    ],
    ['https://www.kuwo.cn/play_detail/00123', 'kuwo', '00123'],
    ['https://music.migu.cn/v3/music/song/00123', 'migu', '00123']
  ]) {
    assert.deepEqual(musicIdFromUrl(url), { type, id })
  }
  for (const url of [
    'https://example.com/song?id=186016',
    'https://music.163.com.example.com/song?id=186016',
    'https://music.163.com/playlist?id=186016',
    'https://music.163.com/song?id=invalid',
    'https://y.qq.com/?mid=00Track9',
    'https://www.kugou.com/song/#hash=not-a-hash',
    'https://music.163.com/song/media/outer/url?id=186016.mp3'
  ]) {
    assert.equal(musicIdFromUrl(url), undefined)
  }
})

test('自定义解析器竞速返回成功后取消剩余 API 请求', async () => {
  let slowSignal: AbortSignal | undefined
  let slowStopped = false
  const info = await resolve('163', '00123', {
    timeoutMs: 100,
    fetchImpl: async (input, { signal } = {}) => {
      if (new URL(input).pathname === '/fast') return new Response(JSON.stringify(cases[1].want))
      assert.ok(signal)
      slowSignal = signal
      return new Promise<Response>((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            slowStopped = true
            reject(signal.reason)
          },
          { once: true }
        )
      })
    },
    resolvers: {
      163: async (id, { json }) =>
        Promise.race([
          json('https://example.test/fast'),
          json('https://example.test/slow')
        ]) as Promise<MusicInfo>
    }
  })
  assert.deepEqual(info, cases[1].want)
  assert.equal(slowSignal?.aborted, true)
  assert.equal(slowStopped, true)
})

test('歌名搜索不依赖链接 ID，完整传递长标题和歌名自带标点', async () => {
  const { searchMusicSinger } = await import('../src/models/music-info')
  const title = '我们打着光脚在风车下跑，手上的狗尾巴草摇啊摇'
  for (const sample of [
    {
      url: 'https://163cn.tv/opaque-share-token',
      step: get(
        'music.163.com',
        '/api/search/get',
        { s: title, type: '1' },
        {
          code: 200,
          result: { songs: [{ id: 123, name: title, artists: [{ name: '搜索歌手' }] }] }
        }
      )
    },
    {
      url: 'https://www.kugou.com/song/#hash=not-a-queryable-hash',
      step: get(
        'mobileservice.kugou.com',
        '/api/v3/search/song',
        { keyword: title },
        {
          status: 1,
          errcode: 0,
          data: { info: [{ hash: 'ignored', songname: title, singername: '搜索歌手' }] }
        }
      )
    },
    {
      url: 'https://y.qq.com/n2m/share/details?u=opaque-token',
      step: get(
        'c.y.qq.com',
        '/soso/fcgi-bin/client_search_cp',
        { w: title },
        {
          code: 0,
          data: { song: { list: [{ songname: title, singer: [{ name: '搜索歌手' }] }] } }
        }
      )
    },
    {
      url: 'https://example.com/share?track=non-queryable',
      step: get(
        'c.y.qq.com',
        '/soso/fcgi-bin/client_search_cp',
        { w: title },
        {
          code: 0,
          data: { song: { list: [{ songname: title, singer: [{ name: '搜索歌手' }] }] } }
        }
      )
    }
  ]) {
    const fixture = fixtures([sample.step])
    assert.equal(await searchMusicSinger(title, sample.url, fixture), '搜索歌手')
    fixture.done()
  }
})

test('歌名搜索只接受完整同名结果，重复版本同歌手可用，异歌手同名不猜测', async () => {
  const { searchMusicSinger } = await import('../src/models/music-info')
  for (const [songs, expected] of [
    [[{ songname: '我们（现场版）', singer: [{ name: '不相关歌手' }] }], ''],
    [
      [
        { songname: '我们', singer: [{ name: '甲' }] },
        { songname: '我们', singer: [{ name: '甲' }] }
      ],
      '甲'
    ],
    [
      [
        { songname: '我们', singer: [{ name: '甲' }] },
        { songname: '我们', singer: [{ name: '乙' }] }
      ],
      ''
    ],
    [[{ songname: null, singer: [{ name: '甲' }] }], '']
  ] as const) {
    const fixture = fixtures([
      get(
        'c.y.qq.com',
        '/soso/fcgi-bin/client_search_cp',
        { w: '我们' },
        { code: 0, data: { song: { list: songs } } }
      )
    ])
    assert.equal(await searchMusicSinger('我们', 'https://example.com/share', fixture), expected)
    fixture.done()
  }
})

test('链接 ID 只区分歌名匹配的搜索结果，指向另一首歌时不能覆盖标题', async () => {
  const { searchMusicSinger } = await import('../src/models/music-info')
  for (const [id, expected] of [
    ['1', '甲'],
    ['2', '乙'],
    ['3', '']
  ] as const) {
    const fixture = fixtures([
      get(
        'music.163.com',
        '/api/search/get',
        { s: '我们' },
        {
          code: 200,
          result: {
            songs: [
              { id: 1, name: '我们', artists: [{ name: '甲' }] },
              { id: 2, name: '我们', artists: [{ name: '乙' }] },
              { id: 3, name: '另外一首歌', artists: [{ name: '丙' }] }
            ]
          }
        }
      )
    ])
    assert.equal(
      await searchMusicSinger('我们', `https://music.163.com/song?id=${id}`, fixture),
      expected
    )
    fixture.done()
  }
})

test('搜索等待上限覆盖响应体，超时取消请求，成功后也释放查询信号', async () => {
  const { searchMusicSinger } = await import('../src/models/music-info')
  let signal: AbortSignal | null | undefined
  await assert.rejects(
    searchMusicSinger('我们', 'https://example.com/share', {
      timeoutMs: 25,
      fetchImpl: async (_input, options) => {
        signal = options?.signal
        const response = new Response()
        response.json = () => new Promise(() => {})
        return response
      }
    }),
    /解析超时 \(25ms\)/
  )
  assert.equal(signal?.aborted, true)
  const singer = await searchMusicSinger('我们', 'https://example.com/share', {
    fetchImpl: async (_input, options) => {
      signal = options?.signal
      return new Response(
        JSON.stringify({
          code: 0,
          data: { song: { list: [{ songname: '我们', singer: [{ name: '甲' }] }] } }
        })
      )
    }
  })
  assert.equal(singer, '甲')
  assert.equal(signal?.aborted, true)
})
