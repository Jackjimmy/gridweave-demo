/** Shared by the private demo build and the public export. */
export function demoHtml(html: string): string {
  return html.replace('maximum-scale=1.0, user-scalable=no, ', '')
    .replace('<title>Gridweave Nonogram</title>', '<title>Gridweave Nonogram — 24-puzzle web demo</title>')
    .replace('</head>', '<meta property="og:title" content="Gridweave Nonogram — Web demo" /><meta property="og:description" content="24 free nonogram puzzles. Solve the clues and reveal pixel art." /><meta property="og:image" content="https://nonogram.com.cn/og-en.png" /></head>')
    .replace('<div id="root"></div>', `<div id="root"><main style="padding:32px;max-width:40rem;margin:auto;font:16px/1.6 system-ui"><h1>Gridweave · 格织</h1><p>Loading the 24-puzzle demo… / 正在加载24关试玩…</p><p>If loading does not finish, check your connection and reload. / 若一直未完成，请检查网络后刷新。</p><a href="">Reload / 重新加载</a> · <a href="https://nonogram.com.cn/">Website / 官网</a><noscript><p>Enable JavaScript to play. / 请启用JavaScript后试玩。</p></noscript></main></div>`)
}
