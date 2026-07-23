import type { CanonicalPoseFrame } from '../types';
import { BodyPart, type BodyCoordinateFrame, type BoneKinematics, type CenterOfMassEstimate, type MotionFeatures, type SymmetryMetrics, type TrackingQuality, type Vec3, type WeightShiftEstimate } from './model';
import { angularDistanceDeg, dot, magnitude, multiplyQuat, inverseQuat, normalize, normalizeQuat, scale, subtract, vec } from './math';
import type { MotionHistoryBuffer } from './history';

const PARENTS: Readonly<Record<number, number>> = {
  [BodyPart.NECK]: BodyPart.UPPER_CHEST, [BodyPart.HEAD]: BodyPart.NECK, [BodyPart.UPPER_CHEST]: BodyPart.CHEST, [BodyPart.CHEST]: BodyPart.WAIST, [BodyPart.WAIST]: BodyPart.HIP,
  [BodyPart.LEFT_UPPER_ARM]: BodyPart.UPPER_CHEST, [BodyPart.LEFT_LOWER_ARM]: BodyPart.LEFT_UPPER_ARM, [BodyPart.LEFT_HAND]: BodyPart.LEFT_LOWER_ARM,
  [BodyPart.RIGHT_UPPER_ARM]: BodyPart.UPPER_CHEST, [BodyPart.RIGHT_LOWER_ARM]: BodyPart.RIGHT_UPPER_ARM, [BodyPart.RIGHT_HAND]: BodyPart.RIGHT_LOWER_ARM,
  [BodyPart.LEFT_UPPER_LEG]: BodyPart.HIP, [BodyPart.LEFT_LOWER_LEG]: BodyPart.LEFT_UPPER_LEG, [BodyPart.LEFT_FOOT]: BodyPart.LEFT_LOWER_LEG,
  [BodyPart.RIGHT_UPPER_LEG]: BodyPart.HIP, [BodyPart.RIGHT_LOWER_LEG]: BodyPart.RIGHT_UPPER_LEG, [BodyPart.RIGHT_FOOT]: BodyPart.RIGHT_LOWER_LEG,
};
const COM_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [BodyPart.HIP, .14], [BodyPart.WAIST, .12], [BodyPart.CHEST, .15], [BodyPart.UPPER_CHEST, .12], [BodyPart.HEAD, .08],
  [BodyPart.LEFT_UPPER_ARM, .028], [BodyPart.RIGHT_UPPER_ARM, .028], [BodyPart.LEFT_LOWER_ARM, .016], [BodyPart.RIGHT_LOWER_ARM, .016],
  [BodyPart.LEFT_UPPER_LEG, .1], [BodyPart.RIGHT_UPPER_LEG, .1], [BodyPart.LEFT_LOWER_LEG, .046], [BodyPart.RIGHT_LOWER_LEG, .046], [BodyPart.LEFT_FOOT, .014], [BodyPart.RIGHT_FOOT, .014],
];
const SYMMETRY_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [BodyPart.LEFT_UPPER_ARM, BodyPart.RIGHT_UPPER_ARM], [BodyPart.LEFT_LOWER_ARM, BodyPart.RIGHT_LOWER_ARM], [BodyPart.LEFT_UPPER_LEG, BodyPart.RIGHT_UPPER_LEG], [BodyPart.LEFT_LOWER_LEG, BodyPart.RIGHT_LOWER_LEG], [BodyPart.LEFT_FOOT, BodyPart.RIGHT_FOOT],
];

function deltaSeconds(history: MotionHistoryBuffer, timestamp: number): number | null {
  const previous = history.latest?.result.timestamp;
  if (previous === undefined) return null;
  const seconds = (timestamp - previous) / 1000;
  return seconds > .001 && seconds < .5 ? seconds : null;
}

function centerOfMass(pose: CanonicalPoseFrame, previous: CenterOfMassEstimate | undefined, seconds: number | null): CenterOfMassEstimate {
  let mass = 0; let weighted = vec();
  for (const [part, weight] of COM_WEIGHTS) {
    const position = pose.bones.get(part)?.position;
    if (!position) continue;
    weighted.x += position.x * weight; weighted.y += position.y * weight; weighted.z += position.z * weight; mass += weight;
  }
  if (!mass) return { available: false, position: null, velocity: null, speed: null, contributingMass: 0 };
  const position = scale(weighted, 1 / mass);
  const velocity = previous?.position && seconds ? scale(subtract(position, previous.position), 1 / seconds) : null;
  return { available: true, position, velocity, speed: velocity ? magnitude(velocity) : null, contributingMass: mass };
}

function symmetry(pose: CanonicalPoseFrame, body: BodyCoordinateFrame): SymmetryMetrics {
  let angleTotal = 0; let lateralTotal = 0; let count = 0; let lateralCount = 0;
  for (const [left, right] of SYMMETRY_PAIRS) {
    const leftBone = pose.bones.get(left); const rightBone = pose.bones.get(right);
    const leftRotation = leftBone?.rotation && normalizeQuat(leftBone.rotation); const rightRotation = rightBone?.rotation && normalizeQuat(rightBone.rotation);
    if (leftRotation && rightRotation) { angleTotal += angularDistanceDeg(leftRotation, rightRotation); count++; }
    if (body.available && leftBone?.position && rightBone?.position) { lateralTotal += Math.abs(dot(subtract(rightBone.position, leftBone.position), body.right)); lateralCount++; }
  }
  return { available: count > 0, orientationDifferenceDeg: count ? angleTotal / count : null, lateralPositionDifference: lateralCount ? lateralTotal / lateralCount : null, contributingPairs: count };
}

function weightShift(com: CenterOfMassEstimate, body: BodyCoordinateFrame): WeightShiftEstimate {
  if (!com.position || !body.available || !body.origin) return { available: false, lateralOffset: null, direction: 'unavailable' };
  const lateralOffset = dot(subtract(com.position, body.origin), body.right);
  return { available: true, lateralOffset, direction: lateralOffset > .02 ? 'right' : lateralOffset < -.02 ? 'left' : 'center' };
}

export function extractKinematics(pose: CanonicalPoseFrame, body: BodyCoordinateFrame, history: MotionHistoryBuffer): Omit<MotionFeatures, 'stability'> {
  const previous = history.latest?.result.features;
  const seconds = deltaSeconds(history, pose.receivedAt);
  const bones = new Map<number, BoneKinematics>();
  let validRotationCount = 0;
  let validPositionCount = 0;
  for (const bone of pose.bones.values()) {
    const orientation = bone.rotation && normalizeQuat(bone.rotation);
    if (orientation) validRotationCount++;
    const parent = PARENTS[bone.bodyPart];
    const parentBone = parent === undefined ? null : pose.bones.get(parent);
    const parentRotation = parentBone?.rotation ? normalizeQuat(parentBone.rotation) : null;
    const relativeOrientation = orientation && parentRotation ? normalizeQuat(multiplyQuat(inverseQuat(parentRotation), orientation)) : null;
    const old = previous?.bones.get(bone.bodyPart);
    const angularVelocityDegPerSec = orientation && old?.orientation && seconds ? angularDistanceDeg(old.orientation, orientation) / seconds : null;
    const angularAccelerationDegPerSec2 = angularVelocityDegPerSec !== null && old?.angularVelocityDegPerSec != null && seconds ? (angularVelocityDegPerSec - old.angularVelocityDegPerSec) / seconds : null;
    const oldPosition = history.latest?.pose.bones.get(bone.bodyPart)?.position;
    const velocity = bone.position && oldPosition && seconds ? scale(subtract(bone.position, oldPosition), 1 / seconds) : null;
    const speed = velocity ? magnitude(velocity) : null;
    const movementDirection = velocity && speed && speed > 1e-8 ? normalize(velocity) : null;
    if (bone.position) validPositionCount++;
    bones.set(bone.bodyPart, { bodyPart: bone.bodyPart, orientation: orientation ?? null, relativeOrientation, angularVelocityDegPerSec, angularAccelerationDegPerSec2, velocity, speed, movementDirection });
  }
  const total = pose.bones.size || 1;
  const rotationQuality = validRotationCount / total;
  const positionQuality = validPositionCount / total;
  const trackingQuality: TrackingQuality = {
    overall: (rotationQuality + positionQuality) / 2,
    rotationQuality,
    positionQuality,
    trackedBodyParts: pose.bones.size,
  };
  const com = centerOfMass(pose, previous?.centerOfMass, seconds);
  return { bones, centerOfMass: com, symmetry: symmetry(pose, body), weightShift: weightShift(com, body), trackingQuality };
}
