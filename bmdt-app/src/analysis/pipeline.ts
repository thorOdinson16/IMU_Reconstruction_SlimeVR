import type { CanonicalPoseFrame } from '../types';
import { normalizeBodyCoordinates } from './body-frame';
import { MotionHistoryBuffer } from './history';
import { calculateJointAngles } from './joint-angles';
import { extractKinematics } from './kinematics';
import type { AnalysisResult, QualityFlag } from './model';
import { extractTemporalMetrics } from './temporal';
import { validateFrame } from './validation';

export interface AnalysisPipelineOptions {
  historyCapacity?: number;
}

/**
 * The application-wide, activity-neutral motion analysis pipeline. It accepts only
 * canonical frames and produces the stable AnalysisResult contract used by modules.
 */
export class BiomechanicsAnalysisPipeline {
  private readonly history: MotionHistoryBuffer;

  constructor(options: AnalysisPipelineOptions = {}) {
    this.history = new MotionHistoryBuffer(options.historyCapacity);
  }

  analyze(pose: CanonicalPoseFrame): AnalysisResult {
    const validation = validateFrame(pose);
    const bodyFrame = normalizeBodyCoordinates(pose);
    const jointAngles = calculateJointAngles(pose);
    const kinematics = extractKinematics(pose, bodyFrame, this.history);
    const { temporal, stability } = extractTemporalMetrics(this.history, pose.receivedAt, kinematics.centerOfMass);
    const qualityFlags = new Set<QualityFlag>([...validation.flags, ...bodyFrame.flags, ...temporal.flags]);
    for (const joint of jointAngles.values()) for (const flag of joint.flags) qualityFlags.add(flag);
    const result: AnalysisResult = {
      timestamp: pose.receivedAt,
      pose,
      validation,
      bodyFrame,
      jointAngles,
      features: { ...kinematics, stability },
      temporal,
      qualityFlags: [...qualityFlags],
    };
    this.history.push({ pose, result });
    return result;
  }

  clearHistory(): void {
    this.history.clear();
  }
}
