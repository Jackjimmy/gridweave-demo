import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { PuzzleData } from '../../types'
import { artColorGrid } from '../../utils/art'
import { resolveSubjectPalette, sceneColorGrid } from '../../utils/scene'
import { getSceneById } from '../../data/scenes'
import { bitmapOf } from './bitmap'
import styles from './Thumbnail.module.css'

interface Props {
  puzzle: PuzzleData
  className?: string
}

/**
 * 关卡完成图案的小尺寸马赛克预览。
 * 有场景的关卡铺满背景色块，与结算卡呈现同一张整图；无场景时只画主体格、其余留白。
 *
 * **画是一张挂进页面的 canvas，在 layout effect 里同步拷上去**——不是背景图。
 *
 * 2026-09-09 曾把它改成 `background-image: url(data:…)`，为的是替换元素与它的底色
 * 走两套取整、小数格宽上漏一条缝。可 WebKit 对 data: URL 走的是**异步**解码：
 * 一面墙新挂上去的画，第一帧全是空格子，之后几帧才一张张亮起来；每亮一张就是一次
 * 脏位图提交。2026-09-15 真机两个症状都从这儿来——收藏页首帧只有别处已经挂着的
 * 那几十张（封面、首页收藏架走缓存），其余空着；左缘返回起手那一帧恰好撞上这批
 * 陆续到达的位图提交，露出的就是刚要退掉的那一页（见 App.tsx 的 prepared 那道门）。
 * 模拟器对照（100 张背景图 vs 100 张 canvas，同一次提交）：canvas 首帧全在，
 * 背景图晚三帧。
 *
 * 所以画回到 canvas：位图早就在手上（bitmapOf 缓存），drawImage 是同步的，首帧
 * 一定有画，也不会再有「晚到的位图」去弄脏任何一层。那条缝另有解法：收藏墙把格宽
 * 按整设备像素取（见 CollectionGrid），画布的边就落在像素边界上，没有东西可漏。
 *
 * 后备存储只有 size×size（一格一个像素），靠 image-rendering: pixelated 放大：
 * 整墙六百张加起来也只有几百 KB——按 DPR 开真实像素尺寸会让一屏画吃掉十几 MB，
 * 而低端机恰好也是内存最紧的那批。
 *
 * 外面裹一层 memo：库快照换新时收藏页整墙缩略图跟着重渲染，而快照里每一关的对象
 * 按 id 复用，memo 让「重画」只落在真换了画的那一关上。
 */
export const Thumbnail = memo(function Thumbnail({ puzzle, className }: Props) {
  const { solution, size } = puzzle
  /*
   * 这一关的画还在路上（只有网页端弱网、开机那一趟到点放行之后才会看到，见
   * data/libraryBoot）。占位关卡的 solution 是空的，给一块同样大小的空白牌。
   */
  const pending = solution.length === 0
  /*
   * 依赖是整个 puzzle，不是 puzzle.id：同一个 id 会先后拿到占位和真关卡两份对象，
   * 场景是跟着册块一起登记的，只认 id 会把占位那一帧「查不到场景」记死。
   */
  const scene = useMemo(() => getSceneById(puzzle.id), [puzzle])
  const colors = useMemo(
    () => artColorGrid(puzzle, resolveSubjectPalette(puzzle, scene)),
    [puzzle, scene],
  )
  const sceneColors = useMemo(() => sceneColorGrid(puzzle, scene), [puzzle, scene])
  const bitmap = useMemo(() => bitmapOf(puzzle, colors, sceneColors), [puzzle, colors, sceneColors])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  // layout effect 而不是 effect：effect 要等首帧画完才跑，那一帧就是一块空牌
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (bitmap) ctx.drawImage(bitmap, 0, 0)
  }, [bitmap, size])

  const classes = [styles.thumbnail]
  if (sceneColors) classes.push(styles.scenic)
  if (pending) classes.push(styles.pending)
  if (className) classes.push(className)

  return (
    <canvas
      ref={canvasRef}
      data-thumb=""
      className={classes.join(' ')}
      width={size}
      height={size}
      aria-hidden="true"
    />
  )
})
