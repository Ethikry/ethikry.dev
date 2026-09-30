import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

// Static output: every page is plain HTML, and only the demos that need React
// hydrate as islands. The Worker in worker/ serves dist/ and routes
// /projects/song-rank/ to that project's own Worker.
export default defineConfig({
  site: 'https://ethikry.dev',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [react()],
})
