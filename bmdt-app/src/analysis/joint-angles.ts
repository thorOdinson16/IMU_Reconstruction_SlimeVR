import type { CanonicalPoseFrame } from '../types';
import { BodyPart, type JointAngles, type JointId, type QualityFlag } from './model';
import { inverseQuat, multiplyQuat, normalizeQuat, quaternionToAnatomicalEuler, quaternionToEuler } from './math';

interface JointDefinition { id: JointId; proximal: number; distal: number; }

const JOINTS: readonly JointDefinition[] = [
  { id: 'neck', proximal: BodyPart.UPPER_CHEST, distal: BodyPart.NECK },
  { id: 'spine', proximal: BodyPart.HIP, distal: BodyPart.UPPER_CHEST },
  { id: 'leftShoulder', proximal: BodyPart.UPPER_CHEST, distal: BodyPart.LEFT_UPPER_ARM },
  { id: 'rightShoulder', proximal: BodyPart.UPPER_CHEST, distal: BodyPart.RIGHT_UPPER_ARM },
  { id: 'leftElbow', proximal: BodyPart.LEFT_UPPER_ARM, distal: BodyPart.LEFT_LOWER_ARM },
  { id: 'rightElbow', proximal: BodyPart.RIGHT_UPPER_ARM, distal: BodyPart.RIGHT_LOWER_ARM },
  { id: 'leftWrist', proximal: BodyPart.LEFT_LOWER_ARM, distal: BodyPart.LEFT_HAND },
  { id: 'rightWrist', proximal: BodyPart.RIGHT_LOWER_ARM, distal: BodyPart.RIGHT_HAND },
  { id: 'leftHip', proximal: BodyPart.HIP, distal: BodyPart.LEFT_UPPER_LEG },
  { id: 'rightHip', proximal: BodyPart.HIP, distal: BodyPart.RIGHT_UPPER_LEG },
  { id: 'leftKnee', proximal: BodyPart.LEFT_UPPER_LEG, distal: BodyPart.LEFT_LOWER_LEG },
  { id: 'rightKnee', proximal: BodyPart.RIGHT_UPPER_LEG, distal: BodyPart.RIGHT_LOWER_LEG },
  { id: 'leftAnkle', proximal: BodyPart.LEFT_LOWER_LEG, distal: BodyPart.LEFT_FOOT },
  { id: 'rightAnkle', proximal: BodyPart.RIGHT_LOWER_LEG, distal: BodyPart.RIGHT_FOOT },
];

function unavailable(definition: JointDefinition, flags: QualityFlag[]): JointAngles {
  return { joint: definition.id, available: false, flexionExtension: null, abductionAdduction: null, internalExternalRotation: null, relativeRotation: null, globalOrientation: null, source: 'unavailable', flags };
}

/** Generic relative-bone rotations under the application-wide XYZ anatomical convention. */
export function calculateJointAngles(pose: CanonicalPoseFrame): ReadonlyMap<JointId, JointAngles> {
  const result = new Map<JointId, JointAngles>();
  for (const definition of JOINTS) {
    const proximalBone = pose.bones.get(definition.proximal);
    const distalBone = pose.bones.get(definition.distal);
    const proximal = proximalBone?.rotation ? normalizeQuat(proximalBone.rotation) : null;
    const distal = distalBone?.rotation ? normalizeQuat(distalBone.rotation) : null;
    if (!proximal || !distal) { result.set(definition.id, unavailable(definition, ['missingRotation'])); continue; }
    const relativeRotation = normalizeQuat(multiplyQuat(inverseQuat(proximal), distal));
    if (!relativeRotation) { result.set(definition.id, unavailable(definition, ['invalidRotation'])); continue; }
    const relative = quaternionToAnatomicalEuler(relativeRotation);
    result.set(definition.id, { joint: definition.id, available: true, ...relative, relativeRotation, globalOrientation: quaternionToEuler(distal), source: 'relativeRotation', flags: [] });
  }
  return result;
}
