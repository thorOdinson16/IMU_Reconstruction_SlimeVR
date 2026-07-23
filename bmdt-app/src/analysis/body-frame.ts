import type { CanonicalPoseFrame } from '../types';
import { BodyPart, type BodyCoordinateFrame, type QualityFlag, type Vec3 } from './model';
import { cross, normalize, normalizeQuat, projectOntoPlane, rotate, WORLD_UP } from './math';

function positionOf(pose: CanonicalPoseFrame, part: number): Vec3 | null { return pose.bones.get(part)?.position ?? null; }

/**
 * Establishes a pelvis-centred coordinate system. World Y remains vertical; forward
 * comes from upper-chest orientation when present, otherwise from torso geometry.
 */
export function normalizeBodyCoordinates(pose: CanonicalPoseFrame): BodyCoordinateFrame {
  const flags: QualityFlag[] = [];
  const origin = positionOf(pose, BodyPart.HIP) ?? positionOf(pose, BodyPart.UPPER_CHEST) ?? positionOf(pose, BodyPart.CHEST);
  const chest = pose.bones.get(BodyPart.UPPER_CHEST) ?? pose.bones.get(BodyPart.CHEST);
  const chestRotation = chest?.rotation ? normalizeQuat(chest.rotation) : null;
  let forward: Vec3 | null = chestRotation ? normalize(projectOntoPlane(rotate(chestRotation, { x: 0, y: 0, z: -1 }), WORLD_UP)) : null;
  if (!forward || forward.x === 0 && forward.z === 0) {
    const left = positionOf(pose, BodyPart.LEFT_UPPER_ARM);
    const right = positionOf(pose, BodyPart.RIGHT_UPPER_ARM);
    if (left && right) forward = normalize(cross(WORLD_UP, normalize({ x: right.x - left.x, y: right.y - left.y, z: right.z - left.z })));
  }
  if (!origin || !forward || forward.x === 0 && forward.z === 0) {
    flags.push('insufficientBodyFrame');
    return { available: false, origin: origin ?? null, right: { x: 1, y: 0, z: 0 }, up: WORLD_UP, forward: { x: 0, y: 0, z: -1 }, flags };
  }
  return { available: true, origin, right: normalize(cross(forward, WORLD_UP)), up: WORLD_UP, forward, flags };
}
