import en from './en'
import zhHans from './zh-Hans'
import zhHant from './zh-Hant'
import ja from './ja'
import ko from './ko'
import de from './de'
import fr from './fr'
import es from './es'
import ptBR from './pt-BR'
import type { Locale } from '../locales'
import type { Messages } from './en'

/**
 * 九份消息包，静态取齐。
 *
 * **只给测试与工具用**：完整性检查要把九份摆在一起比键集，运行时不需要——
 * 运行时只加载当前那一个（见 ./index.ts）。产品代码不许 import 这个文件，
 * 一旦 import 就等于把八份用不到的文案又搬回主包里。
 */
export const ALL_MESSAGES: Record<Locale, Messages> = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko,
  de,
  fr,
  es,
  'pt-BR': ptBR,
}
