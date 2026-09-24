/**
 * 英文消息包，同时是**基准包**。
 *
 * 其余八个 locale 都声明成 `const xx: Messages = {…}`，键少一条、多一条或者
 * 把字符串写成数组，`tsc` 当场报错——翻译完整性因此是编译期的事，不必等运行时。
 *
 * 键名一律 `区域.用途`，区域与界面上的那一块对应（home / album / daily / …）。
 * 占位符写成 `{name}`，值由调用方按名字传。
 */
const en = {
  // ── 通用 ─────────────────────────────────────────────────────────────
  // First play and board-size transitions.
  'journey.homeTitle': 'New here?',
  'journey.homeBody': 'Learn · 5×5',
  'journey.offerTitle': 'Start with a small picture?',
  'journey.offerBody': 'Learn the rules on a 5×5 board, then return to the puzzle you chose. You can skip the lesson at any time.',
  'journey.learn': 'Learn by playing',
  'journey.playSelected': 'Skip and play this puzzle',
  'journey.returnPuzzle': 'Play my chosen puzzle',
  'journey.sizeTitle': 'A {size}×{size} board',
  'journey.size10': 'The rules are the same as 5×5. With more rows and columns, start with a line you can fill, then use the crossing numbers.',
  'journey.size15': 'The same rules, with more cells and number groups. Work one line at a time; × marks help you keep track. Board size and reasoning difficulty are separate.',
  'journey.startPuzzle': 'Start playing',
  'journey.undoTip': 'Made a mistake? Tap undo below to take back your last stroke.',
  'journey.hintTip': 'Stuck? Tap the bulb for an explanation of your next move.',

  // 游戏说明：首页字标点开的那一页（见 Tutorial/AboutCard），也是首页导览的第一页
  'about.aria': 'About Nonogram',
  'about.title': 'Welcome to Nonogram',
  'about.lines': [
    'Fill the grid using the number clues, and a pixel picture will slowly take shape.\nEvery puzzle can be solved with logic alone — no guessing required.',
    'No ads. No lives. Undo anytime, and if you get stuck, free hints will show you the next step.',
    'Finish a puzzle to reveal the artwork and add it to your collection.',
    '4 albums · 100 puzzles free\nUnlock 12 more albums · 500 puzzles with the Full Game.',
  ],
  'about.dismiss': 'Tap anywhere to close',
  // 试玩版把上面最后那句账换成自己的（见 Tutorial/aboutLines）
  'about.demoTail': 'This web demo: 4 featured collections · 24 puzzles.\nThe full game has 16 albums · 600 puzzles.',

  // 第一次打开游戏时的首页导览（见 Tutorial/HomeTour）
  'tour.aria': 'Welcome tour',
  'tour.welcome.continue': 'Tap Continue for a quick tour.',
  'tour.themes.title': 'Themed albums',
  'tour.themes.lines': ['Each theme holds a few albums, and every album is full of puzzles.', 'Open any album and play its puzzles in any order.'],
  // 试玩版首页那张卡（四本精选合集）的导览页，替掉上面的主题页
  'tour.demo.title': 'Featured collections',
  'tour.demo.lines': ['Four collections, six puzzles each — one board size per collection.', 'Open any of them and play its puzzles in any order.'],
  'tour.demo.lessonLines': ['Tap here to learn the game in a couple of minutes.'],
  'tour.collection.title': 'My Collection',
  'tour.collection.lines': ['Every picture you finish is kept here.'],
  'tour.daily.title': 'Daily Challenge',
  'tour.daily.lines': ['A new puzzle every day — this is where to find it.'],
  'tour.lesson.title': 'Start here',
  'tour.lesson.lines': ['Tap this bar to learn the game in a couple of minutes.'],

  // 第二关开局的灯泡介绍（见 Tutorial/HintIntro）
  'hintIntro.title': 'Meet the Hint',
  'hintIntro.lines': ['Tap it to see your next move — and why it works.', 'Free and unlimited. Think of it as your built-in tutorial.'],

  'common.back': 'Back',
  'common.backHome': 'Back to home',
  'common.done': 'Done',
  'app.title': 'Nonogram',

  // ── 按需资源加载 ─────────────────────────────────────────────────────
  'load.retry': 'Try again',
  'load.retrying': 'Trying…',
  'load.dismiss': 'Dismiss',
  'load.languageFailed': 'Some text could not be loaded, so English is showing. Try again once you are back online.',
  'load.puzzleFailed': 'This puzzle could not be loaded. Check your connection and try again.',
  /* 写不进去时压在底部的那一条：说清楚「没被保存」，别让人以为成果已经稳了 */
  'save.failed': 'Your progress could not be saved on this device. Storage may be full or private browsing may be on — try again before you leave.',

  // ── 首页 ─────────────────────────────────────────────────────────────
  'home.daily': 'Daily Challenge',
  'home.account': 'Account',
  'home.settings': 'Settings',
  'home.themes': 'Themes',
  'home.collection': 'My Collection',
  'home.collectionEmpty': 'Every puzzle you solve leaves its picture here.',
  // 试玩版首页那张卡的抬头：「4 本精选合集 · 24 关」
  'home.demoCollections': '{count} featured collections',
  'home.demoPuzzles': '{count} puzzles',
  'home.resume': 'Resume',
  'home.tierFree': 'Free',
  'home.tierFull': 'Full Game',
  'home.albumCleared': 'Completed',

  // ── 主题画册页 ───────────────────────────────────────────────────────
  'library.title': 'Puzzle Books',
  'library.count': '{count} books',
  'library.backLibrary': 'Back to puzzle books',

  // ── 一本画册 ─────────────────────────────────────────────────────────
  'album.pageName': 'Page {page}',
  'album.pageRange': 'Puzzles {from}–{to}',
  'album.pageAria': 'Page {page}',
  'album.pager': 'Page numbers',
  // 右下角那枚方按钮：图标画的是**按下去会去哪儿**，读屏与 title 也这么说
  'album.toOverview': 'Switch to overview',
  'album.toChapters': 'Switch to chapters',
  'album.start': 'Start',
  'album.resume': 'Resume',
  'album.startMeta': 'Puzzle {number}',
  'album.inProgress': 'In progress',
  'album.lockedNumber': 'Puzzle {number}',
  'album.unlockedTally': '{done} of {total} unlocked',
  'album.chapterTally': '{chapter}: {done} of {total} collected',

  // ── 我的收藏 ─────────────────────────────────────────────────────────
  'collection.title': 'My Collection',
  'collection.empty': 'No pictures yet. Solve a puzzle and one appears here.',
  'collection.view': 'View {name}',

  // ── 藏品陈列页 ───────────────────────────────────────────────────────
  'detail.title': 'My Picture',
  'detail.back': 'Back to my collection',
  'detail.from': 'From',
  'detail.chapter': 'Chapter',
  'detail.index': 'Number',
  'detail.indexValue': 'No. {index}',
  'detail.dateFormat': '{full}',
  'detail.firstCleared': 'First solved',
  'detail.bestTime': 'Best time',
  'detail.replay': 'Play again',
  'detail.exitLabel': 'Back to picture',

  // ── 对局 ─────────────────────────────────────────────────────────────
  'game.board': 'Nonogram board',
  'game.backLevels': 'Back to puzzles',
  'game.unlock': 'Picture unlocked!',
  'game.filled': '{done} of {total} filled',
  'game.restartTitle': 'Start this puzzle over?',
  'game.restartDescription': 'The board is cleared and the timer resets. This cannot be undone.',
  'game.restartConfirm': 'Start over',
  'game.restartCancel': 'Keep playing',
  'game.restartMeta': '{cells} cells filled · {time}',
  /* 「How to play」重看之前的那一问：教学从空盘讲起，盘上有东西就得先问一句 */
  'game.tutorialRestartTitle': 'Replay the tutorial?',
  'game.tutorialRestartDescription': 'The tutorial starts from an empty board, so this clears your board and resets the timer. It cannot be undone.',
  'game.tutorialRestartConfirm': 'Clear and replay',
  'game.hintStuck': 'No single line settles it — try reading two lines together.',
  'game.cell': 'Row {row}, column {col}, {state}',
  'game.cellState.empty': 'unknown',
  'game.cellState.filled': 'filled',
  'game.cellState.marked': 'marked empty',

  // ── 操作栏 ───────────────────────────────────────────────────────────
  'actionBar.restart': 'Restart puzzle',
  'actionBar.restartTitle': 'Start this puzzle over',
  'actionBar.modes': 'Input mode',
  'actionBar.mark': 'Mark mode',
  'actionBar.markTitle': 'Mark: put an × on cells you know are empty',
  'actionBar.fill': 'Fill mode',
  'actionBar.fillTitle': 'Fill: paint the cells that belong to the picture',
  'actionBar.undo': 'Undo',

  // ── 顶栏 ─────────────────────────────────────────────────────────────
  'toolbar.tutorial': 'How to play',
  'toolbar.hint': 'Hint',
  'toolbar.settings': 'Settings',

  // ── 结算卡 ───────────────────────────────────────────────────────────
  'win.albumComplete': 'Album complete',
  'win.albumTally': '{total} / {total} pictures collected',
  'win.pictureCollected': 'Picture collected · {picture}',
  'win.chooseAlbum': 'Choose an album',
  // 试玩版集齐一本合集的那张结算卡（见 WinModal 的 data-demo 那一支）
  'win.demoCollectionComplete': 'Collection complete',
  'win.demoChooseAlbum': 'Explore other collections',
  'win.nextChapterAction': 'Next chapter',
  'win.aria': 'Puzzle solved',
  'win.time': '{time}',
  'win.timeFaster': '{time} · {seconds}s faster',
  'win.timeBest': '{time} · best {best}',
  'win.next': 'Next ›',
  'win.chapterComplete': '“{chapter}” complete',
  'win.nextChapter': 'Next chapter · {chapter}',

  // ── 每日挑战 ─────────────────────────────────────────────────────────
  'daily.title': 'Daily Challenge',
  'daily.calendar': 'Daily challenge calendar',
  'daily.exitLabel': 'Back to the daily calendar',
  'daily.completedTally': '{done} of {total} completed',
  'daily.monthLabel': '{monthName} {year}',
  'daily.picker': 'Jump to year and month',
  'daily.year': '{year}',
  'daily.month': '{monthShort}',
  'daily.monthUnreleased': '{monthShort}, not released',
  'daily.monthCleared': '{monthShort}, all solved',
  'daily.dayAvailable': '{date}, available',
  'daily.dayUnreleased': '{date}, not released',
  'daily.completedSuffix': ' · Solved',
  'daily.bestTime': 'Best time {time}',
  'daily.lockedTitle': 'Not yet solved',
  'daily.lockedHintActive': 'Your progress is saved. The name is revealed when you finish.',
  'daily.lockedHint': 'The name is revealed when you finish.',
  'daily.statusCompleted': 'Solved',
  'daily.statusActive': 'In progress',
  'daily.statusIdle': 'Not started',
  'daily.playUnreleased': 'Not released',
  'daily.playLoading': 'Loading…',
  'daily.playContinue': 'Continue',
  'daily.playAgain': 'Play again',
  'daily.playStart': 'Start',
  'daily.errorUnreleased': 'This one is not out yet. Come back on its release date.',
  'daily.errorLoad': 'This one could not be loaded. Check your connection and try again.',
  'daily.weekdays': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],

  // ── 设置 ─────────────────────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.sectionAppearance': 'Appearance',
  'settings.sectionFeedback': 'Feedback',
  'settings.sectionGameplay': 'Gameplay',
  'settings.sectionLanguage': 'Language',
  'settings.languageSystem': 'System default',
  'settings.rate': 'Rate Nonogram',
  'settings.privacy': 'Privacy Policy',
  'settings.sectionAbout': 'About',
  'settings.support': 'Contact Support',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.settleBackdrop': 'Finish backdrop',
  'settings.settleBackdropNone': 'Plain',
  'settings.settleBackdropRays': 'Rays',
  'settings.sound': 'Sound',
  'settings.vibration': 'Vibration',
  'settings.vibrationStyle': 'Haptic feel',
  'settings.vibrationElegant': "Elegant",
  'settings.vibrationVivid': "Vivid",
  'settings.strokeRule': 'Painting rule',
  'settings.strokeRuleEasy': 'Relaxed',
  'settings.strokeRuleStrict': 'Strict',
  'settings.autoMark': 'Auto-mark ×',
  'settings.off': 'Off',
  'settings.on': 'On',
  'settings.versionCurrent': 'Version',
  'settings.versionWeb': 'Web dev build',
  'settings.versionDemo': 'Web demo',
  'settings.versionCommit': 'Git commit',
  'settings.versionDirty': 'uncommitted changes',
  'settings.versionInstalled': 'Installed',
  'settings.versionHint': 'Installed time is recorded the first time this build starts.',

  // ── 开发者菜单（只有 DEV 包看得见） ──────────────────────────────────
  'dev.title': 'Developer',
  'dev.subtitle': 'Only DEV builds show this section.',
  'dev.run': 'Run',
  'dev.armed': 'Tap again',
  'dev.winNow': 'Win this puzzle now',
  'dev.winNowHint': 'Jump straight to the win: reveal, result card and unlock note all play as usual.',
  'dev.unlockAll': 'Unlock everything',
  'dev.unlockAllHint': 'Mark every library puzzle solved and open the whole collection. Daily is untouched.',
  'dev.unlockAllDone': 'Unlocked {count} puzzles',
  'dev.clearProgress': 'Clear puzzle progress',
  'dev.clearProgressHint': 'Wipe saved boards and clear records for library puzzles. Settings and Daily stay.',
  'dev.clearProgressDone': 'Cleared {count} saves',
  'dev.clearDaily': 'Clear daily challenge',
  'dev.clearDailyHint': "Clear daily challenge progress and its local cache to test from a clean state.",
  'dev.clearDailyDone': 'Cleared {count} entries',
  'dev.resetTutorial': 'Replay the tutorial',
  'dev.resetTutorialHint': 'Drop the “already seen” flag so the tutorial pops up again on the tutorial puzzle.',
  'dev.resetTutorialDone': 'It will pop up again next time',
  'dev.resetTutorialNoop': 'It had never been seen',
  'dev.factoryReset': 'Factory reset',
  'dev.factoryResetHint': 'Progress, settings, daily and sign-in all cleared — back to a fresh install.',
  'dev.factoryResetDone': 'Cleared {count} entries, everything back to initial',
  'dev.requestReview': 'Ask for a store rating now',
  'dev.requestReviewHint': 'Call the system review prompt directly, skipping every gate. Store builds only; Play needs a Play-installed package.',
  'dev.requestReviewDone': 'Requested — whether it shows is up to the system',
  'dev.requestReviewFailed': 'Not available here: {reason}',
  'dev.keepAlive': 'Audio keep-alive',
  'dev.keepAliveHint': 'Toggle the in-game keep-alive to A/B the “sound lags after a pause” symptom on a device.',
  'dev.keepAliveOn': 'Keep-alive on',
  'dev.keepAliveOff': 'Keep-alive off — pause 40s in a level, then drag',
  'dev.buildTitle': 'Which build is this',
  'dev.buildId': 'Package',
  'dev.buildBrowser': '(browser)',
  'dev.buildVersion': 'Version',
  'dev.buildStamp': 'Build',
  'dev.buildDevServer': 'dev server',
  'dev.language': 'Language',
  'dev.languageEffective': 'Effective locale',
  'dev.languageSystemTags': 'System reports',

  // ── 新手教学 ─────────────────────────────────────────────────────────
  'tutorial.aria': 'How to play',
  'tutorial.skip': 'Skip',
  'tutorial.next': 'Continue',
  'tutorial.remaining': '{count} to go',
  'tutorial.ok': 'Nice',
  'tutorial.goal.title': 'See the numbers on the side?',
  'tutorial.goal.lines': [
    'The left tells you how many cells to fill in that row, the top tells you the column.',
    'Follow the numbers and a picture appears!',
  ],
  'tutorial.toolMode.title': 'Try this switch',
  'tutorial.toolMode.lines': ['Left draws ×, right paints.', 'Flip it back and forth.'],
  'tutorial.toolUndo.title': 'Painted the wrong cell?',
  'tutorial.toolUndo.lines': ['Tap here to step back.'],
  'tutorial.toolClear.title': 'Want to start over?',
  'tutorial.toolClear.lines': ['Tap here to restart. It asks first.'],
  'tutorial.toolHint.title': 'Stuck? Try the bulb',
  'tutorial.toolHint.lines': ['It points you at the next cell you can work out.'],
  'tutorial.row2.title': 'Now fill row 2',
  'tutorial.row2.lines': ['It needs 5 cells and the row is exactly 5 — fill it all!', 'Press and drag across.'],
  'tutorial.row3.title': 'One more row',
  'tutorial.row3.lines': ['Row 3 is a 5 as well. Fill the whole row.'],
  'tutorial.autoMark.title': 'Look, the × marks appeared',
  'tutorial.autoMark.lines': ['These two columns need 2 each, and they already have them.', 'Once a line is done, the rest is marked for you.'],
  'tutorial.row4.title': 'The middle 3',
  'tutorial.row4.lines': ['Both ends are ×, so exactly 3 cells are left in the middle. Fill them.'],
  'tutorial.row1.title': 'Two 1s with a gap',
  'tutorial.row1.lines': ['Both ends are ×, leaving 3 cells.', 'Two 1s cannot touch, so fill cells 2 and 4.'],
  'tutorial.row5.title': "Now try it yourself",
  'tutorial.row5.lines': ["Read the row and column numbers to find the last cell."],

  // ── 第二步教学：叉子（star 那一关） ─────────────────────────────────
  'tutorial.star.intro.title': 'Time to learn the ×',
  'tutorial.star.intro.lines': ['× marks a cell you know stays empty.', 'The more you rule out, the clearer the rest gets.'],
  'tutorial.star.row2.title': 'Row 2 is a 5',
  'tutorial.star.row2.lines': ['Fill the whole row — you know this one!'],
  'tutorial.star.crossCol1.title': 'Look at column 1',
  'tutorial.star.crossCol1.lines': ["The clues are 1 and 2. The 1 sits in row 2, so the 2 hugs the bottom.", "In this column, the cells in rows 1 and 3 stay empty — mark them ×!"],
  'tutorial.star.fillCol1.title': 'Fill that 2',
  'tutorial.star.fillCol1.lines': ['The two cells left are the 2 from the clue. Fill them!'],
  'tutorial.star.crossCol5.title': 'Column 5 works the same',
  'tutorial.star.crossCol5.lines': ['Also 1 and 2 — rule the rest out the same way.'],
  'tutorial.star.fillCol5.title': 'Finish column 5',
  'tutorial.star.fillCol5.lines': ['Fill both cells and the column is done!'],
  'tutorial.star.row4.title': 'Now row 4',
  'tutorial.star.row4.lines': ['Clues 2 and 2. Both ends are there already — one more cell each.'],
  'tutorial.star.finish.lines': ['Four cells left — you can do this. If you get stuck, tap the Hint and let it teach you.'],

  // ── 提示 ─────────────────────────────────────────────────────────────
  'hint.row': 'this row',
  'hint.col': 'this column',
  'hint.fullLine': 'The clues plus one gap each fill {line} exactly — paint them in order.',
  'hint.fullLineSingle': 'The {run} fills {line} exactly — fill it all in.',
  'hint.runAnchored': 'The {run} fits in only one place, so it can be filled right away.',
  'hint.overlap': 'Wherever the {run} sits, it always covers these middle cells.',
  'hint.clueSatisfied': 'Every clue in {line} is already placed; the rest is empty.',
  'hint.capBlank': 'The {run} is complete, so the cells right next to it stay empty.',
  'hint.gapTooSmall': 'No clue fits in that gap in {line}, so it can be ruled out.',
  'hint.lineFixed': 'Only one arrangement is left in {line}; it can be finished in one go.',
  'hint.general': 'There is new information to be drawn from {line}.',
  'hint.mistake': 'One cell in {line} contradicts the clue. Put it back first.',
  'hint.crossMistake': 'The boxed cell is the one that does not match.',
  'hint.crossMarked': 'It is the boxed cell — it can only be empty.',
  'hint.crossFill': 'It is the boxed cell — you can fill it.',

  // ── 账号 ─────────────────────────────────────────────────────────────
  'account.title': 'Account',
  'account.signedIn': 'Signed in · your progress on this device is unaffected',
  'account.signOut': 'Sign out',
  'account.guestNote': 'You are playing as a guest; progress is stored on this device.',
  'account.guestNote2': 'Signing in will carry progress across devices (coming soon).',
  'account.emailPlaceholder': 'Email address',
  'account.continueGuest': 'Stay a guest',
  'account.sending': 'Sending…',
  'account.sendCode': 'Send code',
  'account.codeSent': 'Code sent to {email}',
  'account.codePlaceholder': '6-digit code',
  'account.resendIn': 'Resend ({seconds})',
  'account.resend': 'Resend',
  'account.signingIn': 'Signing in…',
  'account.signIn': 'Sign in',
  'account.changeEmail': 'Use another email',
  'account.invalidEmail': 'Enter a valid email address',
  'auth.tooMany': 'Too many attempts. Try again in a moment.',
  'auth.serverDown': 'The service is unavailable right now. Try again later.',
  'auth.requestFailed': 'Request failed. Check the email or the code and try again.',
  'auth.offline': 'No network. Try again later.',
  'auth.badCode': 'That code is wrong or has expired',
  'auth.badResponse': 'Unexpected sign-in response. Please try again.',

  // ── 版本更新 ─────────────────────────────────────────────────────────
  'update.aria': 'App update',
  'update.title': 'Version {version} is available',
  'update.meta': 'Download {size} · install over the current version',
  'update.mandatory': 'This version is no longer supported. Please update to keep playing.',
  'update.later': 'Later',
  'update.now': 'Update now',

  // ── 完整版（Google Play 一次性买断） ─────────────────────────────────
  'fullGame.title': 'Full Game',
  'fullGame.oneTime': 'A one-time purchase, kept on this Google account. Not a subscription.',
  'fullGame.oneTimeAppStore': 'A one-time purchase, kept on this Apple Account. Not a subscription.',
  'fullGame.perkLevels': '{count} more puzzles, across {albums} more puzzle books',
  'fullGame.perkDaily': 'Every past Daily Challenge, whenever you like',
  'fullGame.perkQuiet': 'No ads, no account, no subscription',
  'fullGame.buy': 'Unlock for {price}',
  'fullGame.buyNoPrice': 'Unlock the Full Game',
  'fullGame.restore': 'Restore purchase',
  'fullGame.later': 'Not now',
  'fullGame.close': 'Close',
  'fullGame.working': 'Working…',
  'fullGame.checking': 'Connecting to Google Play…',
  'fullGame.checkingAppStore': 'Connecting to the App Store…',
  'fullGame.owned': 'The Full Game is unlocked. Everything is open.',
  'fullGame.lockedAria': 'Full Game, locked',
  'fullGame.noticeUnlocked': 'Full Game unlocked. Everything is open now.',
  'fullGame.noticeCancelled': 'Purchase cancelled. You were not charged.',
  'fullGame.noticePending': 'Google Play is still processing your payment. The Full Game unlocks on its own once it goes through.',
  'fullGame.noticePendingAppStore': 'Your purchase is waiting for approval (for example, Ask to Buy). The Full Game unlocks on its own once it goes through.',
  'fullGame.noticeNotOwned': 'No purchase was found on this Google account.',
  'fullGame.noticeNotOwnedAppStore': 'No purchase was found on this Apple Account.',
  'fullGame.noticeRevoked': 'This purchase was refunded or revoked, so the Full Game is locked again.',
  'fullGame.noticeNetwork': 'Google Play could not be reached. Try again once you are back online.',
  'fullGame.noticeNetworkAppStore': 'The App Store could not be reached. Try again once you are back online.',
  'fullGame.noticeUnavailable': 'Purchases are not available on this device.',
  'fullGame.noticeFailed': 'The purchase could not be completed. If you were charged, it will unlock on its own once the store confirms it, or use Restore purchase later.',
  'fullGame.noticeUnverified': 'This purchase could not be verified yet. If you were charged, it will unlock on its own once the store confirms it — nothing else to do. You can also try Restore purchase later.',
  'fullGame.settingsLabel': 'Full Game',
  'fullGame.settingsOwned': 'Unlocked',
  'fullGame.settingsLocked': 'Locked',
  'fullGame.dailyArchive': 'Today’s puzzle is free. Earlier days are part of the Full Game.',

  // ── 审核通道（只在 Play 包里，Settings → 版本 连点版本号 7 下） ──────
  'review.title': 'Review Access',
  'review.hint': 'For Google Play review only. Enter the review code to open every puzzle and the Daily Archive on this device. Nothing is purchased.',
  'review.placeholder': 'Review code',
  'review.unlock': 'Unlock',
  'review.checking': 'Checking…',
  'review.granted': 'Review access is on. Every puzzle and the Daily Archive are open on this device. No purchase was made.',
  'review.invalid': 'That review code is not valid.',
  'review.revoke': 'Turn off',

  // ── 无障碍 ───────────────────────────────────────────────────────────
  'a11y.artOf': '{name} picture',
}

/**
 * 消息包的形状。八个翻译包都按它声明，键或类型对不上 tsc 直接拦下。
 * 值是 `string` 的键走 `t()`，是 `string[]` 的走 `tList()`。
 */
export type Messages = typeof en

export type MessageKey = keyof Messages

/** 值是单条文本的键 */
export type TextKey = {
  [K in MessageKey]: Messages[K] extends string ? K : never
}[MessageKey]

/** 值是一组文本的键（星期名、教学分行文案） */
export type ListKey = {
  [K in MessageKey]: Messages[K] extends readonly string[] ? K : never
}[MessageKey]

export default en
