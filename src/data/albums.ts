import collections from './collections.json'
import emblems from './emblems.json'

/**
 * 主题画册（puzzle book）的目录。
 *
 * 分类本身不是在这里算的：它由 scripts/classify-formal-collections.ts 产出、
 * 所有者在 work/formal-library-600/review-collections.html 上逐册验收过，
 * 结论落成 collections.json，接入时原样搬过来（scripts/import-formal-library.ts）。
 *
 * 册内顺序也是那份定稿定的，这里不再重排。它不是「尺寸 → solver 轮数」的排序，
 * 而是一本画册的读法：先按尺寸分卷（5×5 序章 / 10×10 正篇 / 15×15 终章），
 * 卷内按题材分章，章序讲一条线（家里的一天、一次下潜、一趟旅程），
 * 末章是这一册的揭晓。轮数只在章内起作用——把同一个场景的关拆开按轮数排，
 * 一册 59 关就成了按难度排好的清单，不是一本画册。
 */
export interface AlbumChapter {
  id: string
  /** 章名；一卷只有一章时为 null，界面不显示小标题 */
  zh: string | null
  en: string | null
  levels: string[]
}

export interface AlbumSection {
  id: string
  /** 本卷的棋盘尺寸，章内关卡尺寸与它一致 */
  size: number
  zh: string
  en: string
  groups: AlbumChapter[]
}

export interface AlbumMeta {
  id: string
  /** 书名 */
  zh: string
  en: string
  /** 所属主题：精选合集 / 日常生活 / 自然世界 / 探索发现，每个主题四本 */
  group: string
  /** 关卡 id，册内顺序即展示顺序；等于 sections 逐章展开 */
  levels: string[]
  /** 册内的卷与章，供画册页做分段小标题 */
  sections: AlbumSection[]
}

/** 一个主题在界面上的那些附加信息：英文副名与定位 */
export interface AlbumGroupMeta {
  /** 与 collections.json 里的 group 同名，它本身就是键 */
  zh: string
  en: string
  /**
   * 定位。精选合集是白送的那一摞，其余三题属于完整版。
   *
   * 这里只决定卡片上那枚角标怎么写；关卡本身一律可玩，App 至今没有购买流程。
   * 真接上内购时，这一栏就是判断依据，界面不必再改一遍。
   */
  tier: 'free' | 'full'
}

/**
 * 四个主题。
 *
 * 中文名就是 collections.json 里的 group；英文副名与定位只出现在界面上，
 * 不进数据文件——分类脚本管的是「哪一关归哪一册」，不管这一题怎么摆在首页。
 * 顺序即首页那条主题横排的顺序，与 collections.json 的册序一致。
 *
 * 主题一级没有自己的画：首页那张主题卡上摆的是它下面四本册子各自的封面
 * （见 ALBUM_EMBLEM_ID）。曾经这里还给每个主题点名过一张「圆章画」，
 * 版式改成四宫格之后没有任何一处再画它，已连同后处理一起删掉。
 */
export const ALBUM_GROUPS: AlbumGroupMeta[] = [
  { zh: '精选合集', en: 'Featured Picks', tier: 'free' },
  { zh: '日常生活', en: 'Everyday Life', tier: 'full' },
  { zh: '自然世界', en: 'Nature & Wildlife', tier: 'full' },
  { zh: '探索发现', en: 'Explore & Discover', tier: 'full' },
]

export const ALBUM_GROUP_META: Record<string, AlbumGroupMeta> = Object.fromEntries(
  ALBUM_GROUPS.map((group) => [group.zh, group]),
)

export const ALBUM_META: AlbumMeta[] = collections.albums.map((album) => ({
  id: album.id,
  zh: album.zh,
  en: album.en,
  group: album.group,
  levels: album.levels,
  sections: album.sections,
}))

/**
 * 每册的封面画：手挑的一关，不随排序或进度变动。
 *
 * 挑的是「这册里最认得出的那张」，而不是最难或最先的那张——封面只有 130px 见方，
 * 在这个尺寸上唯一要紧的是轮廓与配色能不能一眼分辨。格子多不等于认得出：
 * 2026-09-03 按所有者确认的名单选定，完整对应表见 work/formal-library-600/README.md。
 *
 * 封面一律**满色**展示，哪怕这一关还没通。它是印在书封上的画，是「这册里有什么」
 * 的承诺；奖励是翻开书之后一格格填出来的那些图。
 *
 * 这张表落在 emblems.json 而不是写在这里，是因为打包插件也要读它：这十六关连同
 * 它们的场景要随主包走（首页第一屏就要画出来，不能等册块加载），插件据此决定
 * 哪几关进主包。两处各写一份迟早分叉，所以只留一份数据、两边都读它。
 */
export const ALBUM_EMBLEM_ID: Record<string, string> = emblems
