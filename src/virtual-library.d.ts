/**
 * 打包插件生成的两个虚拟模块（见 vite/nonogram-library.ts）。
 *
 * 它们没有对应的源文件，TypeScript 只能靠这份声明认识它们。
 */
declare module 'virtual:nonogram-library' {
  import type { PuzzleData, SceneData } from './types'

  /** 每关的轻量条目：够画书架、页码、关号与「10×10」那行小字，不含画 */
  export interface CatalogEntry {
    id: string
    name: { zh: string; en: string }
    size: number
    difficulty: PuzzleData['difficulty']
  }

  export const CATALOG: CatalogEntry[]
  /** 随主包走的那几关：十六本画册的封面（首页第一屏就要画出来） */
  export const EAGER_PUZZLES: PuzzleData[]
  export const EAGER_SCENES: SceneData[]
  /** 册 id → 加载这一册的画与场景 */
  export const ALBUM_LOADERS: Record<
    string,
    () => Promise<{ puzzles: PuzzleData[]; scenes: SceneData[] }>
  >
}

declare module 'virtual:nonogram-album/*' {
  import type { PuzzleData, SceneData } from './types'

  export const puzzles: PuzzleData[]
  export const scenes: SceneData[]
}
