import type { CanonicalPoseFrame } from '../types';
import type { FrameValidation, QualityFlag } from './model';
import { isFiniteVec, normalizeQuat } from './math';

export function validateFrame(pose: CanonicalPoseFrame): FrameValidation {
  const flags = new Set<QualityFlag>();
  const missingRotation: number[] = [];
  const missingPosition: number[] = [];
  let validRotationCount = 0;
  let validPositionCount = 0;
  if (!pose.bones.size) flags.add('noPose');
  for (const bone of pose.bones.values()) {
    if (!bone.rotation) missingRotation.push(bone.bodyPart);
    else if (normalizeQuat(bone.rotation)) validRotationCount++;
    else flags.add('invalidRotation');
    if (!bone.position) missingPosition.push(bone.bodyPart);
    else if (isFiniteVec(bone.position)) validPositionCount++;
    else flags.add('invalidPosition');
  }
  if (missingRotation.length) flags.add('missingRotation');
  if (missingPosition.length) flags.add('missingPosition');
  return { valid: !flags.has('noPose') && !flags.has('invalidRotation') && !flags.has('invalidPosition'), presentBodyParts: pose.bones.size, rotationCoverage: pose.bones.size ? validRotationCount / pose.bones.size : 0, positionCoverage: pose.bones.size ? validPositionCount / pose.bones.size : 0, flags: [...flags], missingRotation, missingPosition };
}
