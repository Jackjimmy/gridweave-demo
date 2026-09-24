/**
 * Full Game entitlement, as the web demo sees it.
 *
 * Production reads the purchase state from the App Store / Google Play through a native bridge,
 * with an offline cache and a pending-payment flow. That implementation lives in the private
 * repository. The web demo is a direct build, and in production a direct build is always
 * "owned" too, from the first frame. So this file keeps the same state shape and exports with
 * that one answer, and every screen that reads it behaves exactly as it does in the demo today.
 */
export type FullGamePhase = 'checking' | 'unavailable' | 'ready' | 'pending' | 'owned'

export type FullGameNotice =
  | 'unlocked'
  | 'cancelled'
  | 'pending'
  | 'not-owned'
  | 'revoked'
  | 'unverified'
  | 'network'
  | 'unavailable'
  | 'failed'

export interface FullGameState {
  phase: FullGamePhase
  owned: boolean
  entitled: boolean
  price: string | null
  blocker: 'network' | 'unavailable' | null
  busy: 'none' | 'purchase' | 'restore'
  notice: FullGameNotice | null
}

const OWNED: FullGameState = {
  phase: 'owned',
  owned: true,
  entitled: true,
  price: null,
  blocker: null,
  busy: 'none',
  notice: null,
}

export function useFullGame(): FullGameState {
  return OWNED
}

export function fullGameEntitled(): boolean {
  return true
}

export function fullGameState(): FullGameState {
  return OWNED
}

export function initFullGameBilling(): void {}

export async function purchaseFullGame(): Promise<void> {}

export async function restoreFullGame(): Promise<void> {}

export function dismissFullGameNotice(): void {}
