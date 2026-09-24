import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_ENDONYM,
  LOCALE_TAG,
  detectLocale,
  getLocale,
  normalizeLocale,
  resolveLocale,
  setLocale,
  t,
  tList,
  translate,
} from './index'
import { ALL_MESSAGES as MESSAGES } from './messages/all'
import { registerMessages } from './messages'
import { saveLocalePreference } from './preference'

/*
 * 运行时只加载当前语言那一份文案，测试不走开机那条路——不先注册，
 * 下面那几条断言会拿到英文兜底，两边一样，等于什么都没验。
 */
for (const locale of LOCALES) registerMessages(locale, MESSAGES[locale])

afterEach(() => {
  saveLocalePreference('system')
  setLocale('zh-Hans')
})

describe('normalizeLocale', () => {
  it('中文按书写系统分流，不按「zh 开头就是简体」', () => {
    // 台港澳的系统语言就是这几个标签，认成简体等于给错了字
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'ZH_HANT_HK']) {
      expect(normalizeLocale(tag)).toBe('zh-Hant')
    }
    for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN', 'zh-Hans-TW', 'zh-Hans-HK', 'ZH_CN']) {
      expect(normalizeLocale(tag)).toBe('zh-Hans')
    }
  })

  it('葡语首发统一给 pt-BR', () => {
    for (const tag of ['pt', 'pt-BR', 'pt-PT', 'pt-AO']) expect(normalizeLocale(tag)).toBe('pt-BR')
  })

  it('地区变体归到主语言', () => {
    expect(normalizeLocale('en-GB')).toBe('en')
    expect(normalizeLocale('de-AT')).toBe('de')
    expect(normalizeLocale('fr-CA')).toBe('fr')
    expect(normalizeLocale('es-MX')).toBe('es')
    expect(normalizeLocale('ja-JP')).toBe('ja')
    expect(normalizeLocale('ko-KR')).toBe('ko')
  })

  it('不支持的语言认不出来，交给调用方去兜底', () => {
    for (const tag of ['it', 'ru', 'ar', 'th', 'hi', 'nl-BE', '', '   ']) {
      expect(normalizeLocale(tag)).toBeUndefined()
    }
  })
})

describe('detectLocale', () => {
  it('按系统语言顺序取第一个认得的', () => {
    expect(detectLocale(['it-IT', 'ru-RU', 'fr-CA', 'en-US'])).toBe('fr')
  })

  it('一个都认不出时落到英文，不是落到中文', () => {
    expect(detectLocale(['it-IT', 'ru-RU'])).toBe(DEFAULT_LOCALE)
    expect(DEFAULT_LOCALE).toBe('en')
    expect(detectLocale([])).toBe('en')
  })

  it('地址里的 ?lang= 排在系统语言前面，认不出就照旧按系统语言', () => {
    const before = location.href
    try {
      history.replaceState(null, '', '/?lang=zh-Hans')
      expect(detectLocale()).toBe('zh-Hans')
      history.replaceState(null, '', '/?lang=pt-PT')
      expect(detectLocale()).toBe('pt-BR')
      history.replaceState(null, '', '/?lang=xx')
      expect(detectLocale()).toBe(detectLocale([...navigator.languages]))
    } finally {
      history.replaceState(null, '', before)
    }
  })

  it('玩家在设置里选过的语言，胜过地址里的 ?lang=', () => {
    const before = location.href
    try {
      history.replaceState(null, '', '/?lang=ko')
      saveLocalePreference('ja')
      expect(resolveLocale()).toBe('ja')
      saveLocalePreference('system')
      expect(resolveLocale()).toBe('ko')
    } finally {
      history.replaceState(null, '', before)
    }
  })
})

describe('resolveLocale', () => {
  it('玩家选过语言就用他选的，不管系统是什么', () => {
    saveLocalePreference('ja')
    expect(resolveLocale(['de-DE'])).toBe('ja')
  })

  it('没选或选的是「跟随系统」就按系统语言认', () => {
    expect(resolveLocale(['ko-KR'])).toBe('ko')
    saveLocalePreference('system')
    expect(resolveLocale(['ko-KR'])).toBe('ko')
  })

  it('显式给的偏好优先于存下来的那一条', () => {
    saveLocalePreference('ja')
    expect(resolveLocale(['de-DE'], 'fr')).toBe('fr')
    expect(resolveLocale(['de-DE'], 'system')).toBe('de')
  })
})

describe('消息包', () => {
  it('九个 locale 一条键都不少、一条键都不多', () => {
    const base = Object.keys(MESSAGES[DEFAULT_LOCALE]).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort(), `${locale} 的键与英文包对不上`).toEqual(base)
    }
  })

  it('没有空文案，数组型的键长度也一致', () => {
    const base = MESSAGES[DEFAULT_LOCALE] as Record<string, string | string[]>
    for (const locale of LOCALES) {
      const bundle = MESSAGES[locale] as Record<string, string | string[]>
      for (const [key, value] of Object.entries(bundle)) {
        if (Array.isArray(value)) {
          expect(value.length, `${locale} 的 ${key} 条数不对`).toBe((base[key] as string[]).length)
          for (const item of value) expect(item.trim(), `${locale} 的 ${key} 有空项`).not.toBe('')
        } else {
          expect(value.trim(), `${locale} 的 ${key} 是空的`).not.toBe('')
        }
      }
    }
  })

  it('带占位符的文案在每个语言里都保留了它要用到的那些占位符', () => {
    /*
     * 只查「多出来的」：模板可以少用一个参数（英文的月份抬头用 {monthName}，
     * 中文用 {year}/{month}，两边各取所需），但不能凭空多出一个调用方不传的名字——
     * 那会原样把 {foo} 印在界面上。
     */
    const known = new Set<string>()
    const collect = (value: string) => {
      for (const m of value.matchAll(/\{(\w+)\}/g)) known.add(m[1])
    }
    for (const locale of LOCALES) {
      for (const value of Object.values(MESSAGES[locale])) {
        if (typeof value === 'string') collect(value)
      }
    }
    // 英文包用到的占位符集合就是「调用方会传的名字」的上限
    const supplied = new Set<string>()
    for (const value of Object.values(MESSAGES[DEFAULT_LOCALE])) {
      if (typeof value === 'string') {
        for (const m of value.matchAll(/\{(\w+)\}/g)) supplied.add(m[1])
      }
    }
    // 各语言按需另取的几个名字：月份的长/短写法、日期整串
    for (const extra of ['monthName', 'monthShort', 'full', 'month', 'year', 'day']) {
      supplied.add(extra)
    }
    for (const name of known) expect(supplied.has(name), `没人会传 {${name}}`).toBe(true)
  })

  it('每个 locale 都有自己的 Intl 标签与自称', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_TAG[locale]).toBeTruthy()
      expect(LOCALE_ENDONYM[locale]).toBeTruthy()
      // 标签必须是 Intl 认得的，否则日期与月份名会整片退化
      expect(() => new Intl.DateTimeFormat(LOCALE_TAG[locale])).not.toThrow()
    }
  })
})

describe('t', () => {
  it('按名字填占位符，缺参数时原样留着（宁可露出记号，也不悄悄少一段）', () => {
    expect(translate('en', 'album.pageName', { page: 3 })).toBe('Page 3')
    expect(translate('zh-Hans', 'album.pageName', { page: 3 })).toBe('第 3 页')
    expect(translate('en', 'album.pageName')).toBe('Page {page}')
  })

  it('t / tList 读的是当前语言', () => {
    setLocale('ja')
    expect(getLocale()).toBe('ja')
    expect(t('settings.title')).toBe(translate('ja', 'settings.title'))
    // 拿到的确实是日文那一份，不是英文兜底
    expect(t('settings.title')).not.toBe(translate('en', 'settings.title'))
    expect(tList('daily.weekdays')).toEqual(['月', '火', '水', '木', '金', '土', '日'])
  })

  it('文案还没加载到手时回落英文，不显示空白也不崩', () => {
    // 正常路径下开机会先 await（见 i18n/boot），这是那条安全网本身
    expect(translate('en', 'settings.title')).toBe('Settings')
    expect(translate('zh-Hans', 'settings.title')).toBe('设置')
  })

  it('换语言把 <html lang> 一起换掉', () => {
    setLocale('de')
    expect(document.documentElement.lang).toBe('de')
    setLocale('zh-Hant')
    expect(document.documentElement.lang).toBe('zh-Hant')
  })
})
