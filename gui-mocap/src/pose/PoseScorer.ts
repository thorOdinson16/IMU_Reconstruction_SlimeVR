import { BoneT, BodyPart } from 'solarxr-protocol';
import { PoseDefinition, JointScore, JointState } from './types';

function quaternionAngle(
  ax: number, ay: number, az: number, aw: number,
  bx: number, by: number, bz: number, bw: number,
): number {
  const dot = Math.abs(ax * bx + ay * by + az * bz + aw * bw);
  return 2 * Math.acos(Math.min(dot, 1.0));
}

function jointState(score: number): JointState {
  if (score >= 0.8) return 'GREEN';
  if (score >= 0.5) return 'YELLOW';
  return 'RED';
}

export function scorePose(
  skeleton: BoneT[],
  definition: PoseDefinition,
): { overallScore: number; jointScores: JointScore[]; worstJoint?: BodyPart } {
  const liveRotations = new Map<BodyPart, BoneT>();
  for (const bone of skeleton) {
    liveRotations.set(bone.bodyPart, bone);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  const jointScores: JointScore[] = [];
  let worstJoint: BodyPart | undefined;
  let worstScore = Infinity;

  for (const bp of definition.requiredJoints) {
    const live = liveRotations.get(bp);
    if (!live || !live.rotationG) {
      const jScore: JointScore = { bodyPart: bp, score: 0, state: 'RED' };
      jointScores.push(jScore);
      if (jScore.score < worstScore) { worstScore = jScore.score; worstJoint = bp; }
      continue;
    }

    const ref = definition.referenceRotations[bp];
    if (!ref) {
      const jScore: JointScore = { bodyPart: bp, score: 0, state: 'RED' };
      jointScores.push(jScore);
      if (jScore.score < worstScore) { worstScore = jScore.score; worstJoint = bp; }
      continue;
    }

    const tolerance = definition.jointTolerances[bp] ?? 0.5;
    const weight = definition.jointWeights[bp] ?? 1.0;

    const angle = quaternionAngle(
      live.rotationG.x, live.rotationG.y, live.rotationG.z, live.rotationG.w,
      ref.x, ref.y, ref.z, ref.w,
    );

    const score = Math.max(0, 1 - angle / tolerance);
    const jScore: JointScore = {
      bodyPart: bp,
      score,
      state: jointState(score),
    };
    jointScores.push(jScore);

    if (score < worstScore) { worstScore = score; worstJoint = bp; }

    weightedSum += score * weight;
    totalWeight += weight;
  }

  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { overallScore, jointScores, worstJoint };
}
