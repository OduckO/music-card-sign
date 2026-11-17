import { defineConfig } from '@karinjs/template-react'

export default defineConfig({
  standalone: {
    outDir: 'lib/react-template',
    target: 'node24',
    assets: 'copy'
  },
  html: { assetsInlineLimit: 0 }
})
