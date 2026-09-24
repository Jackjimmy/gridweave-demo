import type { SceneData } from '../../types'

/**
 * 完成图的场景背景层。三种来源共用这一张表：
 *
 *   - 十六张封面的场景随主包走（虚拟模块 EAGER_SCENES）
 *   - 其余关卡的场景跟着自己那一册的块进来（ensureAlbumLoaded）
 *   - 每日关卡的场景从 CDN 取回后写进来
 *
 * 三种都走 registerScene，调用方只认 getSceneById。查不到 scene 的关卡回退白底，
 * 行为与接入场景之前一致——册块还没到的关卡因此不会画错，只是先没有背景。
 */
const scenesById = new Map<string, SceneData>()

export function getSceneById(id: string): SceneData | undefined {
  return scenesById.get(id)
}

/** 供每日挑战等远端来源在运行时补充场景 */
export function registerScene(scene: SceneData): void {
  scenesById.set(scene.id, scene)
}
