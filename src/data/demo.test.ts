import { describe, expect, it } from 'vitest'
import { TUTORIAL2_LEVEL_ID, TUTORIAL_LEVEL_ID } from '../components/Tutorial/coachScript'
import { loadAllAlbums, puzzleLibrary } from './index'
import { ALBUM_META } from './albums'
import demo from './demo.json'
import type { PuzzleData } from '../types'
import { validatePuzzle } from '../utils/validator'

/*
 * 网页试玩版的清单（见 vite/demo-content.ts）与正式库的一致性。
 *
 * 清单只是一份点名单，打包插件按它裁；它说的关要是正式库里没有、或不在它声称
 * 的那一册里，试玩版会静默少一关（插件对缺失的 id 是跳过，不是报错——改库不改
 * 清单时构建不该停下来）。所以在这里把它钉死：测试跑的是全库，看得见清单的每一条。
 */
await loadAllAlbums()
const library = new Map(puzzleLibrary().map((puzzle) => [puzzle.id, puzzle]))
const metaById = new Map(ALBUM_META.map((album) => [album.id, album]))

describe('试玩清单 demo.json', () => {
  it('四本合集各六关，共 24 关', () => {
    expect(demo.albums).toHaveLength(4)
    for (const album of demo.albums) expect(album.levels, album.id).toHaveLength(6)
    const all = demo.albums.flatMap((album) => album.levels)
    expect(new Set(all).size).toBe(24)
  })

  it('点名的关都在正式库里，且都属于它声称的那一册', () => {
    for (const album of demo.albums) {
      const meta = metaById.get(album.id)
      expect(meta, `册 ${album.id} 不在 collections.json 里`).toBeDefined()
      for (const id of album.levels) {
        expect(library.has(id), `${album.id} 点名的 ${id} 不在正式库`).toBe(true)
        expect(meta!.levels, `${id} 不在 ${album.id} 册内`).toContain(id)
      }
    }
  })

  it('一册一种尺寸：节日奇谭 5×5，甜品店与深蓝之海 10×10，天空之上 15×15', () => {
    const sizeOf = (albumId: string) =>
      new Set(demo.albums.find((a) => a.id === albumId)!.levels.map((id) => library.get(id)!.size))
    expect(sizeOf('festive-tales')).toEqual(new Set([5]))
    expect(sizeOf('sweet-shop')).toEqual(new Set([10]))
    expect(sizeOf('deep-blue')).toEqual(new Set([10]))
    expect(sizeOf('sky-beyond')).toEqual(new Set([15]))
  })

  it('册内顺序照正式目录，不另排', () => {
    for (const album of demo.albums) {
      const order = metaById.get(album.id)!.levels
      const positions = album.levels.map((id) => order.indexOf(id))
      expect(positions, album.id).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  it('封面是本册的一关（试玩里没有别的画可当封面）', () => {
    for (const album of demo.albums) expect(album.levels, album.id).toContain(album.emblem)
  })

  it('每一关都过关卡校验：唯一解、只靠逐行推理就能解开、配色成对、彼此不重复', () => {
    // 直接读关卡原文件：validator 查的是存盘的样子，不是运行时派生过线索的对象
    const files = import.meta.glob('./puzzles/*/*.json', { eager: true, import: 'default' }) as Record<string, PuzzleData>
    const byId = new Map(Object.values(files).map((puzzle) => [puzzle.id, puzzle]))
    const seen: PuzzleData[] = []
    for (const id of demo.albums.flatMap((album) => album.levels)) {
      const puzzle = byId.get(id)!
      expect(validatePuzzle(puzzle, seen).errors, id).toEqual([])
      seen.push(puzzle)
    }
  })

  it('新手教学的两关（爱心、星星）都在试玩里', () => {
    const festive = demo.albums.find((a) => a.id === 'festive-tales')!
    expect(festive.levels).toContain(TUTORIAL_LEVEL_ID)
    expect(festive.levels).toContain(TUTORIAL2_LEVEL_ID)
  })
})
