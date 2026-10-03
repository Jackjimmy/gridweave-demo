import { isDemoBuild } from '../../config/demo'
import { DemoLinks } from './DemoLinks'
import { useCallback } from 'react'
import type { RefObject } from 'react'
import { useBackHandler } from '../../hooks/useBackHandler'
import { useT } from '../../i18n'
import { aboutLines } from './aboutLines'
import { Spotlight } from './Spotlight'
import { welcomeTexture } from './welcomeTexture'
import styles from './Spotlight.module.css'

interface Props {
  /** 量位置用的根节点：首页整页，聚光要打在它里面的字标上 */
  rootRef: RefObject<HTMLElement | null>
  onClose: () => void
}

/**
 * 游戏说明：首页字标点开的那一页。
 *
 * 与首页导览的欢迎页是同一张卡（同一段话、同一幅底纹、同样聚光打在字标上），
 * 区别只在它是一个**常驻入口**，不接后面那几页导览：想再看一眼「这游戏是什么」
 * 的人不必重新走一遍新手流程。点哪儿都是关（安卓返回键同样），没有别的按钮——
 * 这一页只有一件事可做，就是读完关掉。
 */
export function AboutCard({ rootRef, onClose }: Props) {
  const t = useT()
  useBackHandler(onClose)
  const close = useCallback(() => onClose(), [onClose])
  return (
    <Spotlight
      spot={{ kind: 'element', target: 'title' }}
      rootRef={rootRef}
      cardKey="about"
      intro
      place="center"
      variant="welcome"
      texture={welcomeTexture()}
      onTapThrough={close}
      ariaLabel={t('about.aria')}
      title={isDemoBuild ? `Gridweave · ${t('about.title')}` : t('about.title')}
      lines={aboutLines(t)}
      footAlign="end"
    >
      {isDemoBuild && <DemoLinks compact />}
      <span className={styles.dismissHint}>{t('about.dismiss')}</span>
    </Spotlight>
  )
}
