import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nonogramLibrary } from './vite/nonogram-library.ts'
import { demoContent, readDemoManifest } from './vite/demo-content.ts'

/*
 * The web demo build (https://play.nonogram.com.cn). In the production repository this is
 * `vite build --mode demo`, one build target of the same source as the iOS and Android apps.
 * Content is limited to the four albums in src/data/demo.json; `isDemoBuild`
 * (src/config/demo.ts) hides the few entry points that have nowhere to go in the demo.
 */
function revision(): { sha: string; builtAt: string } {
  let sha = 'nogit'
  try {
    sha = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    // building outside a git checkout is fine
  }
  return { sha, builtAt: new Date().toISOString() }
}

const { sha, builtAt } = revision()

export default defineConfig({
  base: './',
  plugins: [react(), nonogramLibrary({ only: readDemoManifest(process.cwd()) }), demoContent()],
  define: {
    'import.meta.env.VITE_GIT_REVISION': JSON.stringify(sha),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(builtAt),
    'import.meta.env.VITE_BUILD_STAMP': JSON.stringify(`${sha} ${builtAt.slice(0, 16).replace('T', ' ')}`),
  },
  build: { sourcemap: false },
})
