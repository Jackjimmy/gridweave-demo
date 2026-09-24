import { defineConfig } from 'vitest/config'
import { nonogramLibrary } from './vite/nonogram-library.ts'

export default defineConfig({
  // The puzzle library is a virtual module (vite/nonogram-library.ts); tests load the same one.
  plugins: [nonogramLibrary()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
})
