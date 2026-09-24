/**
 * Store review access: not part of the web demo.
 *
 * Production uses it only in the Google Play build. In the web demo it is never granted.
 */
export function reviewAccessGranted(): boolean {
  return false
}

export function useReviewAccess(): boolean {
  return false
}
