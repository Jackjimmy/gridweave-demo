/**
 * Anonymous launch/win counters: not part of the web demo.
 *
 * In production they are reported only from the native Android app. The web demo sends nothing.
 */
export type MetricEvent = 'launch' | 'win' | 'daily_open' | 'daily_win' | 'update_prompt'

export function primeTelemetry(): void {}

export async function track(_event: MetricEvent): Promise<void> {}

export function trackLaunchOncePerDay(_now: Date = new Date()): void {}
