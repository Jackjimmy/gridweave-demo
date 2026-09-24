/**
 * 按需资源的一条统一规矩：**成功留住，失败丢掉**。
 *
 * 这个包里所有「用到了才拉」的东西——语言的文案包、关卡名目录、十六个册块——
 * 从前各写各的一张 `Map<键, Promise>`，写法一样，毛病也一样：Promise 无条件存进去，
 * 拒绝之后仍然留在表里。于是第一次失败就把这一整次会话钉死——后来每一次调用拿到的
 * 都是同一个早已拒绝的 Promise，加载器一次都不会再跑，网络恢复了也没用，
 * 只能整页重载。
 *
 * 这里把那张表收成一处，并且只改一件事：**拒绝的那一笔不留在表里**。有了这一条，
 * 「重试」才有可能是一次真的重试，而不是把同一个失败再兑现一遍。上层因此都能满足
 * 同一条链路：加载中 → 成功 / 可恢复的错误 → 重试 → 成功。
 *
 * 成功的那一笔仍然留着（同一个键只拉一次），在途的那一笔也留着（并发的调用共享
 * 同一趟，不会把同一块拉两遍）。
 */
export interface LazyLoads<K> {
  /** 这个键正在拉、或者已经拉成了。失败过的不算——失败等于没拉过 */
  has(key: K): boolean
  /** 拉这个键；在途或已成的直接给回同一个 Promise。失败会原样抛出，由调用方决定怎么说 */
  load(key: K, run: () => Promise<void>): Promise<void>
  /** 忘掉这个键。测试用，产品代码没有一处需要主动作废一笔成功的加载 */
  forget(key: K): void
}

export function createLazyLoads<K>(): LazyLoads<K> {
  const loads = new Map<K, Promise<void>>()

  return {
    has: (key) => loads.has(key),

    load(key, run) {
      const running = loads.get(key)
      if (running) return running
      const job = run().catch((error: unknown) => {
        /*
         * 整段修复就是这一行。delete 排在 rethrow 之前：调用方拿到的仍是一个
         * 拒绝的 Promise（该报错就报错），但表里已经不留痕迹，下一次调用是
         * 从头再来的一趟。
         *
         * 时序上没有窗口：run() 是同步发出去的，loads.set 紧接着同步执行完，
         * 而这个 catch 最早也要等到一个微任务之后才轮到。
         */
        loads.delete(key)
        throw error
      })
      loads.set(key, job)
      return job
    },

    forget(key) {
      loads.delete(key)
    },
  }
}
