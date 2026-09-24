import type { Puzzle, PuzzleProgress } from '../../types'
import { useT } from '../../i18n'
import { chapterLabel, puzzleDisplayName } from '../../i18n/content'
import { isInProgress, type LevelPage } from '../../utils/levelSections'
import { hasWrapPoint } from '../../utils/nameWrap'
import { countUnlocked } from '../../utils/unlocked'
import { Thumbnail } from '../Thumbnail/Thumbnail'
import styles from './AlbumPage.module.css'
import { SIZE_LABEL } from './sizeLabel'

/*
 * 册页上的一页：按章分段的关卡格。
 *
 * 从 AlbumPage 里提出来，是因为网页试玩版的首页在宽屏上要把一本的六关直接摊在
 * 四本合集下面（见 LevelSelect 的 DemoCollections）——同一张卡、同一套样式，
 * 不另抄一份。样式仍在 AlbumPage.module.css 里，两处读同一份。
 */

export function ChapterGrid({
  page,
  progressMap,
  onSelect,
  coachPuzzleId,
}: {
  page: LevelPage
  progressMap: Record<string, PuzzleProgress>
  onSelect: (puzzleId: string) => void
  /** 首页导览最后一页要指着的那张卡（试玩版宽屏：教学关那一格挂 data-coach="lesson"） */
  coachPuzzleId?: string
}) {
  const t = useT()
  return (
    <div className={styles.chapterList}>
      {page.chapters.map((chapter) => {
        const done = countUnlocked(chapter.puzzles, progressMap)
        /* 章名由三段稳定键解析；每种语言只显示自己的标题。 */
        const name = chapterLabel(chapter.ref, t.locale)
        return (
          <section className={styles.chapter} key={chapter.id} data-chapter-id={chapter.id}>
            <header className={styles.chapterHead} data-complete={done === chapter.puzzles.length}>
              <h2 className={styles.chapterName}>
                <span>{name}</span>
              </h2>
              <span
                className={styles.chapterProgress}
                aria-label={t('album.chapterTally', {
                  chapter: name,
                  done,
                  total: chapter.puzzles.length,
                })}
              >
                {done} / {chapter.puzzles.length}
              </span>
            </header>
            <PuzzleGrid
              puzzles={chapter.puzzles}
              firstNumber={chapter.firstNumber}
              progressMap={progressMap}
              onSelect={onSelect}
              coachPuzzleId={coachPuzzleId}
            />
          </section>
        )
      })}
    </div>
  )
}

export function OverviewGrid({
  page,
  progressMap,
  onSelect,
}: {
  page: LevelPage
  progressMap: Record<string, PuzzleProgress>
  onSelect: (puzzleId: string) => void
}) {
  return (
    <PuzzleGrid
      puzzles={page.puzzles}
      firstNumber={page.firstNumber}
      progressMap={progressMap}
      onSelect={onSelect}
    />
  )
}

export function PuzzleGrid({
  puzzles,
  firstNumber,
  progressMap,
  onSelect,
  coachPuzzleId,
}: {
  puzzles: Puzzle[]
  firstNumber: number
  progressMap: Record<string, PuzzleProgress>
  onSelect: (puzzleId: string) => void
  coachPuzzleId?: string
}) {
  const t = useT()
  return (
    <ul className={styles.grid}>
      {puzzles.map((puzzle, index) => {
        const progress = progressMap[puzzle.id]
        const completed = progress?.completed === true
        const revealed = completed || progress?.everCompleted === true
        const name = puzzleDisplayName(puzzle, t.locale)
        return (
          <li key={puzzle.id}>
            <button
              className={styles.card}
              type="button"
              data-puzzle-id={puzzle.id}
              data-completed={completed}
              data-coach={puzzle.id === coachPuzzleId ? 'lesson' : undefined}
              onClick={() => onSelect(puzzle.id)}
            >
              <span className={styles.art} data-locked={!revealed}>
                {revealed ? (
                  <Thumbnail puzzle={puzzle} className={styles.thumbnail} />
                ) : (
                  <span className={styles.lockedMark}>?</span>
                )}
                {isInProgress(progress) && (
                  <span className={styles.liveDot} aria-label={t('album.inProgress')} />
                )}
              </span>
              <span className={styles.name}>
                {revealed ? (
                  name.secondary !== undefined ? (
                    <>
                      {/* 中日韩：英文主名一行，本地名一行 */}
                      <span className={styles.word} data-fit-name="">
                        {name.primary}
                      </span>
                      <span className={styles.zh} data-fit-name="">
                        {name.secondary}
                      </span>
                    </>
                  ) : (
                    /*
                     * 没有副名的语言（英、德、法、西、葡）：两行都归主名。
                     *
                     * 一格只有 59px 宽（320px 屏上的 4×4），而「Chinesische Münze」
                     * 这种名字收到 8px 都还要 80px——一行放不下不是字号的问题，
                     * 是这一格本来就只够放一行短词。第二行原本给副名，这些语言
                     * 没有副名，那一行正好还给名字自己。
                     */
                    <span
                      className={styles.wordWide}
                      data-fit-wrapped=""
                      data-multiword={hasWrapPoint(name.primary) || undefined}
                      lang={t.locale === 'en' ? 'en' : undefined}
                    >
                      {name.primary}
                    </span>
                  )
                ) : (
                  <>
                    <span className={styles.word}>
                      {t('album.lockedNumber', { number: firstNumber + index })}
                    </span>
                    {/*
                      一册里三种尺寸混排，翻开之前唯一还能告诉人的就是这一局有多大。

                      难度档（轻松 / 标准 / 烧脑）从这里撤了：它是 solver 的传播轮数
                      折出来的，玩家并不按这个尺度感觉难易，而挂在每一格上就成了
                      「这关会不会让我卡住」的预告——没解开之前就先劝退一批。
                      尺寸不一样，那是这一局客观有多大，与好不好推无关。
                    */}
                    <span className={styles.zh} data-fit-name="">
                      {SIZE_LABEL[puzzle.size] ?? puzzle.size}
                    </span>
                  </>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
