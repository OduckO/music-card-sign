import { cp, mkdir, rm } from 'node:fs/promises'
import { build } from 'vite'

await build({ configFile: 'webadapter/src/vite.config.ts' })

await Promise.all([
  cp('.ktr/web/index.html', 'webadapter/panel.html'),
  ...['app.js', 'app.css'].map((name) => cp(`.ktr/web/${name}`, `webadapter/${name}`)),
  ...['settings.html', 'sign.html'].map((name) => rm(`webadapter/${name}`, { force: true }))
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
