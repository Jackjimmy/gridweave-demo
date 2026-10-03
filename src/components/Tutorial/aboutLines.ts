import { demoCopy } from './demoCopy'
import { isDemoBuild } from '../../config/demo'
import type { Translator } from '../../i18n'

/**
 * 游戏说明那几段话（AboutCard 与首页导览的欢迎页共用）。
 *
 * `about.lines` 的最后一段是那笔账——多少关免费、完整版再解锁多少。网页试玩版
 * 的账不一样（四本合集 · 24 关，完整版 16 本 · 600 关），只换这一段；前面讲规则、
 * 讲没有广告、讲通关揭晓的几段，试玩与正式版说的是同一件事，不另抄一份。
 */
export function aboutLines(t: Translator): string[] {
  const lines = t.list('about.lines')
  return isDemoBuild ? [...lines.slice(0, -1), t('about.demoTail'), demoCopy[t.locale].storage] : [...lines]
}
