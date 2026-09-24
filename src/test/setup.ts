import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setLocale } from '../i18n'
import { registerMessages } from '../i18n/messages'
import zhHans from '../i18n/messages/zh-Hans'

// 未开启 vitest globals 时 testing-library 不会自动 cleanup
afterEach(cleanup)

/** 固定使用可写的内存实现，避免 Node/jsdom 版本差异影响 localStorage 异常测试 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
})

/*
 * 测试一律跑简体中文。
 *
 * 六百多条既有断言写的是界面上的中文原文；把测试默认语言定在中文，这套断言
 * 继续钉住的仍是同一件事——「这一处该出现这句话」——只是那句话现在从消息包里来。
 * 换成英文只会让六十多个测试文件跟着改一遍字符串，改不出任何新的保障。
 *
 * 要验别的语言的测试自己 setLocale，用完在 afterEach 里换回来（见 i18n 的测试）。
 *
 * 运行时只加载当前语言那一份文案（见 i18n/messages），而测试不走开机那条路，
 * 所以在这里把简体那一份直接注册进去；别的语言要用的测试自己 registerMessages。
 */
registerMessages('zh-Hans', zhHans)

beforeEach(() => {
  setLocale('zh-Hans')
  /*
   * 每个用例都从「刚打开这一页」开始。
   *
   * 浏览器里一次页面加载就是一条新会话，history.state 天然是空的；jsdom 却让
   * 同一个 window 跑完整个文件，上一个用例导航时写下的条目会留在这里——下一个
   * 用例一挂载，浏览器历史那套就会把人「恢复」到上一个用例最后停的那一层
   * （见 hooks/useBrowserHistory）。这一句把那份残留清掉。
   */
  sessionStorage.clear()
  window.history.replaceState(null, '')
})

// jsdom 尚未实现原生 dialog；浏览器实测负责焦点圈定与背景 inert。
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
