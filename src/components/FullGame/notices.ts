import { isAppStoreBuild } from '../../config/distribution'
import type { FullGameNotice } from '../../billing/entitlement'
import type { TextKey } from '../../i18n'

/**
 * 购买结果 → 文案键。
 *
 * 单独一份而不是各页各写：说这句话的有两处（购买面板与设置里那一行），两处
 * 各写一张表的话，同一个结果迟早在两处说出不同的话——而这两处的读者是同一个人。
 */
const NOTICE_KEY: Record<FullGameNotice, TextKey> = {
  unlocked: 'fullGame.noticeUnlocked',
  cancelled: 'fullGame.noticeCancelled',
  pending: 'fullGame.noticePending',
  'not-owned': 'fullGame.noticeNotOwned',
  revoked: 'fullGame.noticeRevoked',
  unverified: 'fullGame.noticeUnverified',
  network: 'fullGame.noticeNetwork',
  unavailable: 'fullGame.noticeUnavailable',
  failed: 'fullGame.noticeFailed',
}

/**
 * 点了商店名字的那几句，在 App Store 渠道上换成 Apple 的说法。
 *
 * 不用 `{store}` 占位符去拼：「记在这个 Google 账号上」与「记在这个 Apple 账号上」
 * 在九种语言里不都是换一个名词就成立的（i18n/README 的规矩：整句翻译，不拼片段）。
 * 所以每一句各有一份 App Store 版本，键名后缀 AppStore；没列进来的句子两边通用。
 */
const APP_STORE_KEY: Partial<Record<TextKey, TextKey>> = {
  'fullGame.oneTime': 'fullGame.oneTimeAppStore',
  'fullGame.checking': 'fullGame.checkingAppStore',
  'fullGame.noticePending': 'fullGame.noticePendingAppStore',
  'fullGame.noticeNotOwned': 'fullGame.noticeNotOwnedAppStore',
  'fullGame.noticeNetwork': 'fullGame.noticeNetworkAppStore',
}

/** 这个渠道上该用的那一句：App Store 渠道取 Apple 版本，其余渠道原句 */
export function storeTextKey(key: TextKey): TextKey {
  return isAppStoreBuild ? (APP_STORE_KEY[key] ?? key) : key
}

/** 这个购买结果在这个渠道上该说的那一句 */
export function fullGameNoticeKey(notice: FullGameNotice): TextKey {
  return storeTextKey(NOTICE_KEY[notice])
}
