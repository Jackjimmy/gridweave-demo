import styles from './AlbumAward.module.css'

interface Props {
  className?: string
  /**
   * 摘掉封面上那块白底片，只留花章本身。
   *
   * 封面画上那一枚要靠白底把自己从画里分出来；进度那一行底下就是书的封面色，
   * 再压一块白片就成了贴纸。尺寸也随之改由用处给（--award-size）。
   */
  plain?: boolean
}

/** Bootstrap Icons award-fill（MIT，许可见 public/licenses/bootstrap-icons.txt）。 */
export function AlbumAward({ className = '', plain = false }: Props) {
  return (
    <span
      className={`${styles.award} ${className}`}
      data-album-award=""
      data-plain={plain ? '' : undefined}
      aria-hidden="true"
    >
      <svg className={styles.icon} viewBox="0 0 16 16" width="20" height="20" fill="currentColor" focusable="false">
        <path d="m8 0 1.669.864 1.858.282.842 1.68 1.337 1.32L13.4 6l.306 1.854-1.337 1.32-.842 1.68-1.858.282L8 12l-1.669-.864-1.858-.282-.842-1.68-1.337-1.32L2.6 6l-.306-1.854 1.337-1.32.842-1.68L6.331.864z" />
        <path d="M4 11.794V16l4-1 4 1v-4.206l-2.018.306L8 13.126 6.018 12.1z" />
      </svg>
    </span>
  )
}
