/**
 * App update check: not part of the web demo.
 *
 * In production only the directly distributed Android app polls a release manifest. The web
 * demo never updates itself this way, so the check always answers "nothing new". The production
 * implementation lives in the private repository.
 */
export interface UpdateInfo {
  versionCode: number
  versionName: string
  apkUrl: string
  apkSize: number
  releaseNotes: string
  mandatory: boolean
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return null
}
