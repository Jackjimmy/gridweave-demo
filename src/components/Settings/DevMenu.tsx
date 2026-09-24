/**
 * Developer menu: not part of the web demo.
 *
 * Settings only mounts it on internal debug builds, never with `isDemoBuild`. The production
 * menu lives in the private repository.
 */
export function DevMenu(_props: { onWinNow?: () => void; onClose: () => void }): null {
  return null
}
