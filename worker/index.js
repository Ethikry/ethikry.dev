/**
 * ethikry.dev's front door.
 *
 * Everything is this repo's static build (dist/), served from the Worker's
 * assets, except /projects/song-rank/…, which is handed path-unchanged to that
 * project's own Worker through a service binding. song-rank deploys on its own
 * schedule and is built with its /projects/song-rank/ base path, so no
 * rewriting is needed. Another separately-deployed project is one line in
 * PROJECTS plus a [[services]] entry and a run_worker_first path in
 * wrangler.toml.
 *
 * This replaces the placeholder router that used to live beside song-rank's
 * demo; it deploys under the same Worker name so the custom domain carries
 * over.
 */
const PROJECTS = {
  'song-rank': 'SONG_RANK',
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const m = url.pathname.match(/^\/projects\/([^/]+)(\/.*)?$/)
    const binding = m && PROJECTS[m[1]]
    if (binding) {
      // Relative asset URLs only resolve under the trailing slash.
      if (!m[2]) return Response.redirect(`${url.origin}/projects/${m[1]}/${url.search}`, 301)
      return env[binding].fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
}
