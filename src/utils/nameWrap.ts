/**
 * 这个名字里有没有可以换行的空白。
 *
 * 画册名在封面上最多两行，长了要折。折在哪儿有两条路：空格处，或者词的中间
 * 加连字符（CSS 的 hyphens: auto）。两条同时开着的时候，**贪心断行会先选后者**——
 * 浏览器一行一行往下摆，能塞多少塞多少，「Fresh Market」于是断成
 * 「Fresh Mar-」＋「ket」（iOS 上实测），而不是本该的「Fresh」＋「Market」。
 * 断在空格处两个词都完整，断在词中间就得先把两截拼回去才认得出是什么。
 *
 * 所以：名字里有空格的，一律不许自动断词（hyphens: manual，见各页 .albumName
 * 的 [data-multiword]）；只有一个词又放不下的（德语「Süßwarenladen」那一类），
 * 才让 hyphens: auto 去断——那时候连字符是唯一体面的收法。
 *
 * 判据用 \s 而不是半角空格：法语的窄不换行空格、中日韩里偶尔混进的全角空格
 * 都是同一件事，它们都是浏览器认的断行位置。
 */
export function hasWrapPoint(name: string): boolean {
  return /\s/.test(name)
}
