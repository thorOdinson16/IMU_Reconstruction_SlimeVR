import type { AnalysisResult, JointId } from './model';

export interface AngleRange {
  min: number;
  max: number;
}

export interface JointTarget {
  jointId: JointId;
  flexionExtension: AngleRange;
  abductionAdduction: AngleRange;
  internalExternalRotation: AngleRange;
}

export interface ReferencePose {
  id: string;
  name: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  targets: JointTarget[];
  requiredBones: number[];
  metadata: Record<string, string>;
}

export interface AngleDeviation {
  actual: number | null;
  target: AngleRange;
  deviation: number | null;
  withinTolerance: boolean;
}

export interface JointDeviation {
  jointId: JointId;
  available: boolean;
  flexionExtension: AngleDeviation;
  abductionAdduction: AngleDeviation;
  internalExternalRotation: AngleDeviation;
  matchFactor: number;
}

export interface PoseDifference {
  poseId: string;
  timestamp: number;
  deviations: JointDeviation[];
  overallMatch: number;
  trackedTargets: number;
  totalTargets: number;
  matchedTargets: number;
  feedback: string[];
}

function deviationForAngle(actual: number | null, target: AngleRange): AngleDeviation {
  if (actual === null) return { actual: null, target, deviation: null, withinTolerance: false };
  if (actual >= target.min && actual <= target.max) return { actual, target, deviation: 0, withinTolerance: true };
  const deviation = actual < target.min ? target.min - actual : actual - target.max;
  return { actual, target, deviation, withinTolerance: false };
}

const JOINT_LABELS: Record<JointId, string> = {
  neck: 'Neck', spine: 'Spine',
  leftShoulder: 'Left shoulder', rightShoulder: 'Right shoulder',
  leftElbow: 'Left elbow', rightElbow: 'Right elbow',
  leftWrist: 'Left wrist', rightWrist: 'Right wrist',
  leftHip: 'Left hip', rightHip: 'Right hip',
  leftKnee: 'Left knee', rightKnee: 'Right knee',
  leftAnkle: 'Left ankle', rightAnkle: 'Right ankle',
};

const DIRECTION_LABELS: Record<string, (joint: string, degrees: number) => string> = {
  flexionExtension_under: (j, d) => `${j}: bend more forward (${d.toFixed(0)}°)`,
  flexionExtension_over: (j, d) => `${j}: straighten (${d.toFixed(0)}°)`,
  abductionAdduction_under: (j, d) => `${j}: move further out (${d.toFixed(0)}°)`,
  abductionAdduction_over: (j, d) => `${j}: bring closer in (${d.toFixed(0)}°)`,
  internalExternalRotation_under: (j, d) => `${j}: rotate more inward (${d.toFixed(0)}°)`,
  internalExternalRotation_over: (j, d) => `${j}: rotate more outward (${d.toFixed(0)}°)`,
};

function generateFeedback(deviations: JointDeviation[]): string[] {
  const messages: string[] = [];
  for (const dev of deviations) {
    if (!dev.available) continue;
    const label = JOINT_LABELS[dev.jointId];
    const check = (key: string, angle: AngleDeviation) => {
      if (angle.actual === null || angle.deviation === null || angle.withinTolerance) return;
      const dirKey = angle.actual < angle.target.min ? `${key}_under` : `${key}_over`;
      const generator = DIRECTION_LABELS[dirKey];
      if (generator) messages.push(generator(label, angle.deviation));
    };
    check('flexionExtension', dev.flexionExtension);
    check('abductionAdduction', dev.abductionAdduction);
    check('internalExternalRotation', dev.internalExternalRotation);
  }
  return messages;
}

export class PoseComparisonEngine {
  compare(live: AnalysisResult, reference: ReferencePose): PoseDifference {
    const deviations: JointDeviation[] = [];
    let matchSum = 0;
    let matchedCount = 0;
    let trackedCount = 0;

    for (const target of reference.targets) {
      const liveJoint = live.jointAngles.get(target.jointId);
      const available = liveJoint?.available === true && liveJoint.source !== 'unavailable';

      const fe = deviationForAngle(available ? liveJoint!.flexionExtension : null, target.flexionExtension);
      const aa = deviationForAngle(available ? liveJoint!.abductionAdduction : null, target.abductionAdduction);
      const ir = deviationForAngle(available ? liveJoint!.internalExternalRotation : null, target.internalExternalRotation);

      let jointScore = 0;
      let angleCount = 0;
      for (const angle of [fe, aa, ir]) {
        if (angle.deviation !== null) {
          jointScore += angle.withinTolerance ? 1 : 0;
          angleCount++;
        }
      }
      const matchFactor = angleCount > 0 ? jointScore / angleCount : 0;
      matchSum += matchFactor;
      trackedCount++;
      if (matchFactor >= 1) matchedCount++;

      deviations.push({ jointId: target.jointId, available, flexionExtension: fe, abductionAdduction: aa, internalExternalRotation: ir, matchFactor });
    }

    const overall = trackedCount > 0 ? matchSum / trackedCount : 0;
    const feedback = generateFeedback(deviations);

    return {
      poseId: reference.id,
      timestamp: live.timestamp,
      deviations,
      overallMatch: overall,
      trackedTargets: trackedCount,
      totalTargets: reference.targets.length,
      matchedTargets: matchedCount,
      feedback,
    };
  }
}
