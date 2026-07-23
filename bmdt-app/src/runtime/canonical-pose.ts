import type { BoneT } from 'solarxr-protocol';
import type { CanonicalBone, CanonicalPoseFrame } from '../types';

/**
 * The application-facing pose contract. It intentionally preserves engine output
 * without calculating angles, scores, or activity-specific values.
 */
export function normalizePoseFrame(bones: BoneT[]): CanonicalPoseFrame {
  const normalized = new Map<number, CanonicalBone>();

  for (const bone of bones) {
    normalized.set(bone.bodyPart, {
      bodyPart: bone.bodyPart,
      rotation: bone.rotationG
        ? { x: bone.rotationG.x, y: bone.rotationG.y, z: bone.rotationG.z, w: bone.rotationG.w }
        : null,
      position: bone.headPositionG
        ? { x: bone.headPositionG.x, y: bone.headPositionG.y, z: bone.headPositionG.z }
        : null,
      length: bone.boneLength,
    });
  }

  return {
    receivedAt: performance.now(),
    bones: normalized,
    trackedBodyParts: normalized.size,
  };
}
