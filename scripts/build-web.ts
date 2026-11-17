import { cp, rm } from 'node:fs/promises'
import { build } from 'vite'

await build({ configFile: 'web/vite.config.ts' })

await Promise.all(
  ['settings.html', 'sign.html'].map((name) => cp('webadapter/index.html', `webadapter/${name}`))
)
await rm('webadapter/index.html')
