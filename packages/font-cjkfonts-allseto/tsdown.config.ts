import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  external: ['./index.css'],
  copy: [
    { from: 'src/files/cjkFonts_allseto_v1.11.ttf', to: 'dist/files' },
    { from: 'src/index.css', to: 'dist' },
  ],
  unbundle: true,
})
