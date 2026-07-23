import type { CenterOfMassEstimate, StabilityMetrics, TemporalMetrics } from './model';
import type { MotionHistoryBuffer } from './history';

const STILL_SPEED_METERS_PER_SECOND = .04;
const STABILITY_WINDOW_SAMPLES = 80;

export function extractTemporalMetrics(history: MotionHistoryBuffer, timestamp: number, com: CenterOfMassEstimate): { temporal: TemporalMetrics; stability: StabilityMetrics } {
  const previous = history.latest?.result;
  const rawInterval = previous ? timestamp - previous.timestamp : null;
  const frameIntervalMs = rawInterval && rawInterval > 1 && rawInterval < 500 ? rawInterval : null;
  const flags = [] as TemporalMetrics['flags'][number][];
  if (!previous) flags.push('insufficientHistory');
  if (previous && !frameIntervalMs) flags.push('timestampDiscontinuity');
  let speedSquareSum = com.speed === null ? 0 : com.speed * com.speed;
  let samples = com.speed === null ? 0 : 1;
  history.forEachNewest((entry, index) => {
    if (index >= STABILITY_WINDOW_SAMPLES - 1) return;
    const speed = entry.result.features.centerOfMass.speed;
    if (speed !== null) { speedSquareSum += speed * speed; samples++; }
  });
  const recentCenterOfMassSpeedRms = samples ? Math.sqrt(speedSquareSum / samples) : null;
  const still = recentCenterOfMassSpeedRms === null ? null : recentCenterOfMassSpeedRms < STILL_SPEED_METERS_PER_SECOND;
  const poseHoldDurationMs = still && previous?.features.stability.still && frameIntervalMs ? previous.temporal.poseHoldDurationMs + frameIntervalMs : still ? 0 : 0;
  return { temporal: { frameIntervalMs, historyDurationMs: history.durationMs(timestamp), poseHoldDurationMs, sampleCount: history.size + 1, flags }, stability: { available: com.available && recentCenterOfMassSpeedRms !== null, centerOfMassSpeed: com.speed, recentCenterOfMassSpeedRms, still } };
}
