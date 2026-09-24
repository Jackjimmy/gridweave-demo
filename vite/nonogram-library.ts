import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import type { DemoManifest } from './demo-content.ts'

/*
 * 关卡库的分包插件。
 *
 * 从前 578 关连同 578 份场景全部随主包分发：开机就把 726KB 的 JSON 解析进内存，
 * 而一个人打开首页真正要看的只有十六张封面和自己解锁过的那几张缩略图。
 *
 * 这里把它拆成两层：
 *
 *   1. **目录**（虚拟模块 `virtual:nonogram-library`）随主包走。每关只留
 *      id / 尺寸 / 难度 / 名字，够画出书架、页码、关号和「10×10」那行小字，
 *      578 关加起来约 60KB。十六张封面的完整关卡与场景也在这一层——它们是
 *      首页第一屏就要画出来的东西，不能等。
 *
 *   2. **每册一个块**（虚拟模块 `virtual:nonogram-album/<册 id>`）。翻开哪一本
 *      才加载哪一本，块里是这一册全部关卡的画与场景。册块由 `ALBUM_LOADERS`
 *      里十六条写死的 `import()` 引出，打包器据此自然切出十六个块——
 *      不走 `import.meta.glob` 的懒加载：那样是 578 个动态入口，既切出上千个
 *      文件，又要在主包里常年放一张 1156 条的映射表（实测 161KB）。
 *
 * 目录在构建时从磁盘上的关卡文件现读，不落成仓库里的第三份产物：关卡增删是
 * puzzle-release 那条流水线的日常，任何需要「记得同步」的中间文件迟早会过期。
 */

const LIBRARY_ID = 'virtual:nonogram-library'
/** 目录从这几处读出来；开发期其中任何一处一动，目录就得重读（见 handleHotUpdate） */
const LIBRARY_SOURCES = [
  '/src/data/puzzles/',
  '/src/data/scenes/files/',
  '/src/data/collections.json',
  '/src/data/emblems.json',
  '/src/data/demo.json',
]
const ALBUM_PREFIX = 'virtual:nonogram-album/'
/** Rollup 约定：虚拟模块的解析结果加 \0 前缀，别的插件据此不去碰它 */
const NUL = '\0'

interface CollectionsFile {
  albums: { id: string; levels: string[] }[]
}

interface RawPuzzle {
  id: string
  name: { zh: string; en: string }
  size: number
  difficulty: string
}

interface Library {
  /** 关卡 id → 关卡 JSON 在项目里的路径（以 / 开头，dev 与构建都认） */
  puzzlePath: Map<string, string>
  /** 关卡 id → 场景 JSON 路径；没有场景的关卡不在表里 */
  scenePath: Map<string, string>
  catalog: RawPuzzle[]
  albums: { id: string; levels: string[] }[]
  /** 随主包走的那几关：十六本画册的封面 */
  eagerIds: string[]
}

/**
 * 读整库；给了试玩清单（`--mode demo`，见 demo-content.ts）就只读清单点名的那几关：
 * 目录、册块、封面全按清单裁，没点名的关卡文件连 import 语句都不会生成，
 * 也就不可能被打进包。
 */
function readLibrary(root: string, only?: DemoManifest): Library {
  const puzzlePath = new Map<string, string>()
  const catalog: RawPuzzle[] = []
  const puzzleRoot = join(root, 'src/data/puzzles')
  for (const dir of readdirSync(puzzleRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    for (const file of readdirSync(join(puzzleRoot, dir.name))) {
      if (!file.endsWith('.json')) continue
      const raw = JSON.parse(readFileSync(join(puzzleRoot, dir.name, file), 'utf-8')) as RawPuzzle
      if (only && !only.levelIds.has(raw.id)) continue
      puzzlePath.set(raw.id, `/src/data/puzzles/${dir.name}/${file}`)
      catalog.push({ id: raw.id, name: raw.name, size: raw.size, difficulty: raw.difficulty })
    }
  }

  const scenePath = new Map<string, string>()
  const sceneRoot = join(root, 'src/data/scenes/files')
  for (const file of readdirSync(sceneRoot)) {
    if (!file.endsWith('.json')) continue
    scenePath.set(file.slice(0, -'.json'.length), `/src/data/scenes/files/${file}`)
  }

  const collections = JSON.parse(
    readFileSync(join(root, 'src/data/collections.json'), 'utf-8'),
  ) as CollectionsFile
  const emblems = only
    ? Object.fromEntries(only.albums.map((album) => [album.id, album.emblem]))
    : (JSON.parse(readFileSync(join(root, 'src/data/emblems.json'), 'utf-8')) as Record<string, string>)

  // 册序照目录定稿，清单只说「留哪些」；册内只留清单点名的关
  const kept = only && new Map(only.albums.map((album) => [album.id, new Set(album.levels)]))
  const albums = collections.albums
    .filter((album) => !kept || kept.has(album.id))
    .map((album) => ({
      id: album.id,
      levels: kept ? album.levels.filter((id) => kept.get(album.id)!.has(id)) : album.levels,
    }))

  return {
    puzzlePath,
    scenePath,
    catalog,
    albums,
    // 目录里没有的封面直接跳过：改库不改封面表时不该让整个构建停下来
    eagerIds: Object.values(emblems).filter((id) => puzzlePath.has(id)),
  }
}

/** 生成一串 `import x0 from '...'`，返回导入语句与变量名 */
function imports(prefix: string, paths: string[]): { code: string; names: string[] } {
  const names = paths.map((_, i) => `${prefix}${i}`)
  return {
    code: paths.map((path, i) => `import ${names[i]} from '${path}'`).join('\n'),
    names,
  }
}

function libraryModule(library: Library): string {
  const eagerPuzzles = library.eagerIds.map((id) => library.puzzlePath.get(id)!)
  const eagerScenes = library.eagerIds
    .map((id) => library.scenePath.get(id))
    .filter((path): path is string => path !== undefined)
  const puzzles = imports('p', eagerPuzzles)
  const scenes = imports('s', eagerScenes)
  const loaders = library.albums
    .map((album) => `  ${JSON.stringify(album.id)}: () => import('${ALBUM_PREFIX}${album.id}'),`)
    .join('\n')

  return `${puzzles.code}
${scenes.code}

export const CATALOG = ${JSON.stringify(library.catalog)}

export const EAGER_PUZZLES = [${puzzles.names.join(', ')}]

export const EAGER_SCENES = [${scenes.names.join(', ')}]

export const ALBUM_LOADERS = {
${loaders}
}
`
}

function albumModule(library: Library, albumId: string): string {
  const album = library.albums.find((entry) => entry.id === albumId)
  if (!album) return `export const puzzles = []\nexport const scenes = []\n`
  const levels = album.levels.filter((id) => library.puzzlePath.has(id))
  const puzzles = imports('p', levels.map((id) => library.puzzlePath.get(id)!))
  const scenes = imports(
    's',
    levels
      .map((id) => library.scenePath.get(id))
      .filter((path): path is string => path !== undefined),
  )
  return `${puzzles.code}
${scenes.code}

export const puzzles = [${puzzles.names.join(', ')}]

export const scenes = [${scenes.names.join(', ')}]
`
}

export interface LibraryOptions {
  /** 试玩版：只打清单点名的那几关（见 demo-content.ts） */
  only?: DemoManifest
}

export function nonogramLibrary(options: LibraryOptions = {}): Plugin {
  let root = process.cwd()
  let library: Library | null = null
  const read = () => (library ??= readLibrary(root, options.only))

  return {
    name: 'nonogram:library',
    configResolved(config) {
      root = config.root
    },
    resolveId(id) {
      if (id === LIBRARY_ID || id.startsWith(ALBUM_PREFIX)) return NUL + id
    },
    load(id) {
      if (!id.startsWith(NUL)) return
      const virtualId = id.slice(NUL.length)
      if (virtualId === LIBRARY_ID) return libraryModule(read())
      if (virtualId.startsWith(ALBUM_PREFIX)) {
        return albumModule(read(), virtualId.slice(ALBUM_PREFIX.length))
      }
    },
    /*
     * 关卡文件在开发期是会增删的（puzzle-release 接一批新关就动这两个目录）。
     * 目录是开服那一刻从磁盘读的，读完就存着，所以文件一动就得让它重读——
     * 否则新接的关卡要重启开发服务器才看得见，而那正是最容易被当成 bug 的时刻。
     */
    handleHotUpdate({ file, server }) {
      if (!LIBRARY_SOURCES.some((source) => file.includes(source))) return
      library = null
      for (const module of server.moduleGraph.getModulesByFile(file) ?? []) {
        server.moduleGraph.invalidateModule(module)
      }
      const virtual = server.moduleGraph.getModuleById(NUL + LIBRARY_ID)
      if (virtual) server.moduleGraph.invalidateModule(virtual)
      server.hot.send({ type: 'full-reload' })
      return []
    },
  }
}
