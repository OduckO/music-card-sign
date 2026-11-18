import { cp, mkdir } from 'node:fs/promises'
import { build } from 'vite'

await build({ configFile: 'webadapter/src/vite.config.ts' })

await Promise.all([
  ...['settings.html', 'sign.html'].map((name) => cp('.ktr/web/index.html', `webadapter/${name}`)),
  ...['app.js', 'app.css'].map((name) => cp(`.ktr/web/${name}`, `webadapter/${name}`))
])

await mkdir('webadapter/fonts', { recursive: true })
await Promise.all(
  ['Regular', 'Bold'].map((weight) =>
    cp(
      `node_modules/@lobehub/webfont-harmony-sans-sc/fonts/HarmonyOS_Sans_SC_${weight}.woff2`,
      `webadapter/fonts/HarmonyOS_Sans_SC_${weight}.woff2`
    )
  )
)
await cp('node_modules/@lobehub/webfont-harmony-sans-sc/LICENSE', 'webadapter/fonts/LICENSE')
await cp('webadapter/src/fonts.css', 'webadapter/fonts/fonts.css')
