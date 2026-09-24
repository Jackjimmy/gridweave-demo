import type { UpdateInfo } from '../../utils/updateCheck'

/**
 * App update prompt: not part of the web demo.
 *
 * Only the directly distributed Android app checks for updates (see src/utils/updateCheck.ts).
 * The production prompt lives in the private repository.
 */
export function UpdateModal(_props: { info: UpdateInfo; onClose: () => void }): null {
  return null
}
