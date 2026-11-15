import assert from 'node:assert/strict'
import test from 'node:test'

async function resolve (...args) {
  let module
  try {
    module = await import('../lib/models/music-info.js')
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail('music-info.js must implement resolveMusicInfo before these fixtures can pass')
    }
    throw error
  }
  assert.equal(typeof module.resolveMusicInfo, 'function')
  return module.resolveMusicInfo(...args)
}

function fixtures (steps) {
  const pending = [...steps]
  return {
    fetchImpl: async (input, options = {}) => {
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

function get (host, pathname, params, data) {
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
  singer: [{ id: 1, name: '甲' }, { id: 2, name: '乙' }],
  album: { id: 5, mid: '00Album9', title: '离线专辑' }
}

function qqSteps (id, audio = 'C40000Track9.m4a?vkey=fixture') {
  const key = /^\d+$/.test(id) ? 'songid' : 'songmid'
  return [
    get('c.y.qq.com', '/v8/fcg-bin/fcg_play_single_song.fcg', {
      [key]: id, format: 'json'
    }, { code: 0, data: [qqTrack] }),
    {
      check: (url, options) => {
        assert.equal(url.href, 'https://u.y.qq.com/cgi-bin/musicu.fcg')
        assert.equal(options.method, 'POST')
        const body = JSON.parse(options.body)
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
            midurlinfo: [{ songmid: 'unrelated', purl: 'wrong.m4a' }, {
              songmid: '00Track9', purl: audio
            }]
          }
        }
      }
    }
  ]
}

function neteaseSteps (audio = 'https://audio.example.test/163.mp3') {
  return [
    get('music.163.com', '/api/song/detail', { ids: '["00123"]' }, {
      code: 200,
      songs: [{
        id: 123, name: '网易歌曲',
        artists: [{ name: '网易歌手' }], album: { picUrl: '//image.example.test/163.jpg' }
      }]
    }),
    get('music.163.com', '/api/song/enhance/player/url', {
      ids: '["00123"]', br: '128000'
    }, {
      code: 200,
      data: [{ id: 999, code: 200, url: 'https://audio.example.test/wrong.mp3' }, {
        id: 123, code: 200, url: audio
      }]
    })
  ]
}

function kugouSteps (audio = 'https://audio.example.test/kugou.mp3') {
  return [get('m.kugou.com', '/app/i/getSongInfo.php', {
    cmd: 'playInfo', hash: '00AbC9'
  }, {
    status: 1, hash: '00AbC9', songName: '酷狗歌曲', singerName: '酷狗歌手',
    url: audio, imgUrl: 'https://image.example.test/{size}/kugou.jpg'
  })]
}

function kuwoSteps (audio = 'https://audio.example.test/kuwo.mp3') {
  return [
    get('www.kuwo.cn', '/api/www/music/musicInfo', { mid: '00123' }, {
      code: 200, data: { rid: 123, name: '酷我歌曲', artist: '酷我歌手', pic: 'https://image.example.test/kuwo.jpg' }
    }),
    get('www.kuwo.cn', '/api/v1/www/music/playUrl', {
      mid: '00123', type: 'convert_url', httpsStatus: '1'
    }, { code: 200, data: { url: audio } })
  ]
}

function miguSteps (audio = 'https://audio.example.test/migu.mp3') {
  return [get('music.migu.cn', '/v3/api/music/audioPlayer/getSongInfo', {
    copyrightId: '00123'
  }, {
    returnCode: '000000',
    songItem: {
      copyrightId: '00123', songName: '咪咕歌曲', singer: '咪咕歌手',
      mp3: audio, img: '//image.example.test/migu.jpg'
    }
  })]
}

const cases = [
  {
    type: 'qq', id: '00Track9', steps: () => qqSteps('00Track9'),
    want: {
      title: '离线歌曲', singer: '甲 / 乙',
      url: 'https://y.qq.com/n/ryqq/songDetail/00Track9',
      audio: 'https://stream.qqmusic.qq.com/C40000Track9.m4a?vkey=fixture',
      image: 'https://y.gtimg.cn/music/photo_new/T002R300x300M00000Album9.jpg'
    }
  },
  {
    type: '163', id: '00123', steps: neteaseSteps,
    want: {
      title: '网易歌曲', singer: '网易歌手', url: 'https://music.163.com/song?id=00123',
      audio: 'https://audio.example.test/163.mp3', image: 'https://image.example.test/163.jpg'
    }
  },
  {
    type: 'kugou', id: '00AbC9', steps: kugouSteps,
    want: {
      title: '酷狗歌曲', singer: '酷狗歌手', url: 'https://www.kugou.com/song/#hash=00AbC9',
      audio: 'https://audio.example.test/kugou.mp3', image: 'https://image.example.test/400/kugou.jpg'
    }
  },
  {
    type: 'kuwo', id: '00123', steps: kuwoSteps,
    want: {
      title: '酷我歌曲', singer: '酷我歌手', url: 'https://www.kuwo.cn/play_detail/00123',
      audio: 'https://audio.example.test/kuwo.mp3', image: 'https://image.example.test/kuwo.jpg'
    }
  },
  {
    type: 'migu', id: '00123', steps: miguSteps,
    want: {
      title: '咪咕歌曲', singer: '咪咕歌手', url: 'https://music.migu.cn/v3/music/song/00123',
      audio: 'https://audio.example.test/migu.mp3', image: 'https://image.example.test/migu.jpg'
    }
  }
]

for (const entry of cases) {
  test(`${entry.type}: official response chain returns real metadata and audio`, async () => {
    const fixture = fixtures(entry.steps())
    assert.deepEqual(await resolve(entry.type, entry.id, fixture), entry.want)
    fixture.done()
  })

  test(`${entry.type}: absent audio fails instead of manufacturing a playback URL`, async () => {
    const fixture = fixtures(entry.type === 'qq' ? qqSteps(entry.id, '') : entry.steps(null))
    await assert.rejects(resolve(entry.type, entry.id, fixture), { code: 'ERR_MUSIC_AUDIO_UNAVAILABLE' })
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
      resolvers: { '163': async value => {
        assert.equal(value, String(id))
        return cases[1].want
      } }
    })
  }
})

test('invalid types and IDs fail before any network access', async () => {
  const options = { fetchImpl: () => assert.fail('Invalid input must not perform I/O') }
  await assert.rejects(resolve('custom', '123', options), { code: 'ERR_MUSIC_PLATFORM' })
  for (const id of ['', ' 00123', '00123 ', '1.5', '-1', '1&x=2', 'https://example.test', {}, null, 1.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(resolve('163', id, options), { code: 'ERR_MUSIC_ID' })
  }
  await assert.rejects(resolve('migu', '00Ab9', options), { code: 'ERR_MUSIC_ID' })
  await assert.rejects(resolve('qq', '00_a', options), { code: 'ERR_MUSIC_ID' })
})

test('unsafe URL schemes in resolver output are rejected', async () => {
  for (const field of ['url', 'audio', 'image']) {
    for (const value of ['file:///tmp/audio', 'data:audio/mpeg;base64,AAAA', 'javascript:alert(1)', '/relative', 'https:missing-slashes']) {
      await assert.rejects(resolve('163', '00123', {
        resolvers: { '163': async () => ({ ...cases[1].want, [field]: value }) }
      }), { code: 'ERR_MUSIC_URL' })
    }
  }
})

test('missing title or singer fails; a genuinely absent cover is returned as empty', async () => {
  for (const field of ['title', 'singer']) {
    await assert.rejects(resolve('163', '00123', {
      resolvers: { '163': async () => ({ ...cases[1].want, [field]: '' }) }
    }), { code: 'ERR_MUSIC_METADATA' })
  }
  const info = await resolve('163', '00123', {
    resolvers: { '163': async () => ({ ...cases[1].want, image: undefined }) }
  })
  assert.equal(info.image, '')
})

test('HTTP failure and malformed JSON have distinct useful errors', async () => {
  const steps = neteaseSteps()
  steps[0].status = 403
  await assert.rejects(resolve('163', '00123', fixtures([steps[0]])), {
    code: 'ERR_MUSIC_HTTP', status: 403
  })
  await assert.rejects(resolve('163', '00123', {
    fetchImpl: async () => new Response('<html>blocked</html>')
  }), { code: 'ERR_MUSIC_RESPONSE' })
})

test('platform error responses and unrelated songs are not used as metadata', async () => {
  const denied = neteaseSteps()
  denied[0].data = { code: 403, songs: [] }
  await assert.rejects(resolve('163', '00123', fixtures([denied[0]])), { code: 'ERR_MUSIC_RESPONSE' })
  const wrong = neteaseSteps()
  wrong[0].data.songs[0].id = 999
  await assert.rejects(resolve('163', '00123', fixtures([wrong[0]])), { code: 'ERR_MUSIC_METADATA' })
})

test('QQ relative audio requires a real HTTP(S) stream origin from the response', async () => {
  const steps = qqSteps('00Track9')
  steps[1].data.req_0.data.sip = []
  await assert.rejects(resolve('qq', '00Track9', fixtures(steps)), { code: 'ERR_MUSIC_AUDIO_UNAVAILABLE' })
  const unsafe = qqSteps('00Track9')
  unsafe[1].data.req_0.data.sip = ['file:///tmp/']
  await assert.rejects(resolve('qq', '00Track9', fixtures(unsafe)), { code: 'ERR_MUSIC_URL' })
})

test('network rejection preserves its cause', async () => {
  const cause = new Error('offline fixture')
  await assert.rejects(resolve('163', '00123', {
    fetchImpl: async () => { throw cause }
  }), error => error.code === 'ERR_MUSIC_NETWORK' && error.cause === cause)
})

test('timeout aborts fetch and does not depend on fetch observing the abort', async () => {
  let signal
  await assert.rejects(resolve('163', '00123', {
    timeoutMs: 15,
    fetchImpl: async (_, options) => {
      signal = options.signal
      return new Promise(() => {})
    }
  }), { code: 'ERR_MUSIC_TIMEOUT' })
  assert.equal(signal.aborted, true)
})

test('timeout also bounds response-body reads and custom resolvers', async () => {
  await assert.rejects(resolve('163', '00123', {
    timeoutMs: 15,
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) })
  }), { code: 'ERR_MUSIC_TIMEOUT' })
  await assert.rejects(resolve('migu', '00123', {
    timeoutMs: 15,
    resolvers: { migu: async () => new Promise(() => {}) }
  }), { code: 'ERR_MUSIC_TIMEOUT' })
})

test('custom resolver requests use the same timeout and URL restrictions', async () => {
  await assert.rejects(resolve('163', '00123', {
    fetchImpl: () => assert.fail('A non-HTTP URL must not reach fetch'),
    resolvers: { '163': async (id, { fetchImpl }) => {
      await fetchImpl('file:///tmp/song')
      return cases[1].want
    } }
  }), { code: 'ERR_MUSIC_URL' })
  let signal
  await assert.rejects(resolve('163', '00123', {
    timeoutMs: 15,
    fetchImpl: async (_, options) => {
      signal = options.signal
      return new Promise(() => {})
    },
    resolvers: { '163': async (id, { fetchImpl }) => {
      await fetchImpl(`https://example.test/song/${id}`)
      return cases[1].want
    } }
  }), { code: 'ERR_MUSIC_TIMEOUT' })
  assert.equal(signal.aborted, true)
})

test('invalid options fail explicitly instead of disabling timeouts or overrides', async () => {
  for (const timeoutMs of [0, -1, Infinity, NaN, '8000', 2147483648]) {
    await assert.rejects(resolve('163', '00123', { timeoutMs }), { code: 'ERR_MUSIC_OPTIONS' })
  }
  await assert.rejects(resolve('qq', '00Track9', { resolvers: { qq: null } }), { code: 'ERR_MUSIC_OPTIONS' })
  await assert.rejects(resolve('163', '00123', { fetchImpl: null }), { code: 'ERR_MUSIC_OPTIONS' })
})

test('插件注册自己的歌曲来源，接收原始 ID 和超时上下文', async t => {
  const { registerMusicResolver } = await import('../lib/models/music-info.js')
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

test('旧插件的注销函数不会移除后来注册的解析器，内置来源也可覆盖', async t => {
  const { registerMusicResolver } = await import('../lib/models/music-info.js')
  assert.equal(typeof registerMusicResolver, 'function')
  const old = registerMusicResolver('163', async () => assert.fail('旧解析器应被替换'))
  const current = registerMusicResolver('163', async () => cases[1].want)
  t.after(current)
  old()
  assert.deepEqual(await resolve('163', 'private:00123'), cases[1].want)
})

test('注册解析器仍检查完整歌曲信息，并在超时后中止信号', async t => {
  const { registerMusicResolver } = await import('../lib/models/music-info.js')
  assert.equal(typeof registerMusicResolver, 'function')
  let signal
  const slow = registerMusicResolver('slow-plugin', async (id, context) => {
    signal = context.signal
    return new Promise(() => {})
  })
  const incomplete = registerMusicResolver('incomplete-plugin', async () => ({ title: '仅有标题' }))
  t.after(slow)
  t.after(incomplete)
  await assert.rejects(resolve('incomplete-plugin', '00123'), { code: 'ERR_MUSIC_METADATA' })
  await assert.rejects(resolve('slow-plugin', '00123', { timeoutMs: 15 }), { code: 'ERR_MUSIC_TIMEOUT' })
  assert.equal(signal.aborted, true)
})

test('自定义解析器竞速返回成功后取消剩余 API 请求', async () => {
  let slowSignal
  let slowStopped = false
  const info = await resolve('163', '00123', {
    timeoutMs: 100,
    fetchImpl: async (input, { signal }) => {
      if (new URL(input).pathname === '/fast') return new Response(JSON.stringify(cases[1].want))
      slowSignal = signal
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          slowStopped = true
          reject(signal.reason)
        }, { once: true })
      })
    },
    resolvers: { '163': async (id, { json }) => Promise.race([
      json('https://example.test/fast'), json('https://example.test/slow')
    ]) }
  })
  assert.deepEqual(info, cases[1].want)
  assert.equal(slowSignal.aborted, true)
  assert.equal(slowStopped, true)
})
