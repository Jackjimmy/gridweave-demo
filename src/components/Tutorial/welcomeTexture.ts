import astronautData from '../../data/puzzles/hard/sky-beyond-25-astronaut.json'
import type { PuzzleData } from '../../types'
import { puzzleBitmap } from '../Thumbnail/bitmap'

/**
 * 欢迎卡底下那幅淡淡的画：「宇航员」。
 *
 * 直接从关卡文件取，不经关卡库——它在「天空之上」那一册里，第一次打开游戏时
 * 那一册的块还没到，查表查不着。整幅只有 15×15 个像素，随主包走不费什么。
 * 只画主体、不铺星空：压到一成不透明时，星空那些散点在字底下就是一片噪点，
 * 而单独一个人形还认得出是谁。编一次就够：模块级懒算，之后每次开卡都是同一幅。
 */
let astronautTexture: string | null | undefined
export function welcomeTexture(): string | null {
  if (astronautTexture === undefined) {
    astronautTexture = puzzleBitmap(astronautData as PuzzleData, undefined)
  }
  return astronautTexture ?? null
}
