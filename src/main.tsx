import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.tsx'
import { SettingsProvider } from './hooks/useSettings.tsx'
import { initI18n } from './i18n/boot'
import { preloadLibrary } from './data/libraryBoot'
import { migrateLegacyProgress } from './utils/legacyIds'
import { installInputModality } from './utils/inputModality'
import { isDemoBuild } from './config/demo'

/*
 * 平台标记：ios / android / web，写在根节点上供 CSS 分流。
 *
 * 绝大多数样式两端共用，个别补偿只对某一个引擎成立。这类补偿一律挂在
 * html[data-platform] 下面，别写成两端共用的数值：为一端治病，另一端跟着落下
 * 病根——顶栏那两枚图标就栽过这一跤，共用的 −10px 把 iOS 扶正、把安卓推歪。
 *
 * 不过那一处最后并不是靠分平台解决的：补偿治的是症状，而症状随系统版本走
 * （同一条 −10px 在 iOS 16 上是修、在 iOS 26 上是坏）。改治病灶——居中换成 flex，
 * 不碰 WebKit 量 SVG 固有尺寸那条路径——三端都不必补，见 Toolbar.module.css。
 * 眼下没有任何一条按平台分流的样式，这个标记留着，是给下一个真绕不过去的补偿用的。
 */
document.documentElement.dataset.platform = Capacitor.getPlatform()
/*
 * 网页试玩版的标记（`--mode demo`，见 config/demo.ts）。几处只属于试玩的版式——横屏时
 * 操作条留在底部、首页与册页的宽屏布局——按它分流，写在各自的样式表里。
 */
if (isDemoBuild) document.documentElement.dataset.demo = ''

const releaseInputModality = installInputModality()
import.meta.hot?.dispose(releaseInputModality)

const root = createRoot(document.getElementById('root')!)

/*
 * 语言先定下来再挂树：界面文案与关卡名要在第一帧就是对的，不能先英文一闪
 * 再跳成本地语言（见 i18n/boot.ts）。等的是一份关卡名目录，二十来 KB。
 *
 * **挂树这一步不许有任何前提。** 从前这里是 `.then(mount)`：语言资源拉不到，
 * initI18n 拒绝，mount 就永远不跑——屏幕上一片空白，没有一个可点的东西，
 * 也没有任何一条路能让人重试。现在 initI18n 自己降级、永不拒绝（拉不到就跑
 * 内置英文并出一条可重试的提示），这里再挂一个失败分支：即便将来有人在
 * 那条路上加进一个会抛的调用，第一帧照样出得来。
 *
 * 关卡库与语言资源并行取齐（见 data/libraryBoot）：挂树之后屏幕上不再有「画还在
 * 路上」的占位——首页收藏架、收藏页、左缘返回垫底的上一层，全都假定页面挂上
 * 之后是静态的。它自己永不拒绝、到点就放行，所以不会让挂树多出一个前提。
 *
 * 存档迁移（2026-09-26 正式库改 ID，见 utils/legacyIds）也在挂树之前做完：进度是
 * 挂树那一刻按关卡 ID 一次读进来的，迁晚了首页就会先显示一遍「全没解过」。
 * 它同样永不拒绝，绝大多数设备上只是读一个完成标记。
 */
void Promise.all([initI18n(), preloadLibrary(), migrateLegacyProgress()]).then(mount, mount)

function mount() {
  if (import.meta.env.VITE_SWIPE_PROBE) {
    // 画册翻页的手势探针，只给 AppUITests/AlbumSwipeTimingUITests 用的包带上（见 dev/swipeProbe）。
    // 显式环境变量开启，普通 production build 会移除此分支。
    void import('./dev/swipeProbe')
  }
  if (import.meta.env.VITE_DAILY_LAB === '1') {
    // 每日挑战调试台：本地看不到线上排期，用写死的数据喂正式组件（见 dev/DailyLab）。
    void import('./dev/DailyLab/DailyLab.tsx').then(({ DailyLab }) => {
      root.render(
        <StrictMode>
          <SettingsProvider>
            <DailyLab />
          </SettingsProvider>
        </StrictMode>,
      )
    })
  } else if (import.meta.env.VITE_REVEAL_LAB === '1') {
    // 揭晓动画调试台：显式环境变量开启，普通 production build 会移除此分支。
    void import('./dev/RevealLab/RevealLab.tsx').then(({ RevealLab }) => {
      root.render(
        <StrictMode>
          <RevealLab />
        </StrictMode>,
      )
    })
  } else {
    root.render(
      <StrictMode>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </StrictMode>,
    )
  }
}
