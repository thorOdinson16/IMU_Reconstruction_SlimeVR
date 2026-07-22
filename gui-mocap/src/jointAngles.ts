import { BoneT, BodyPart } from 'solarxr-protocol';

export interface JointAngles {
  leftElbow: number | null;             // degrees, 180 = fully extended, 0 = fully flexed
  rightElbow: number | null;
  leftKnee: number | null;              // degrees, 180 = fully extended, 0 = fully flexed
  rightKnee: number | null;
  leftShoulderAbduction: number | null; // degrees, 0 = arm at side, 90 = horizontal, 180 = overhead
  rightShoulderAbduction: number | null;
  leftHipFlexion: number | null;        // degrees, 0 = standing neutral, increases as leg flexes forward
  rightHipFlexion: number | null;
  trunkLean: number | null;             // degrees, 0 = upright
  spineRotationYaw: number | null;      // degrees, signed, chest yaw relative to hip
  timestamp: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function len(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

function norm(v: Vec3): Vec3 {
  const l = len(v);
  if (l < 1e-10) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function quaternionYaw(q: { x: number; y: number; z: number; w: number }): number {
  const sinY = 2 * (q.w * q.y + q.x * q.z);
  const cosY = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(sinY, cosY) * (180 / Math.PI);
}

function threePointAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const ba = sub(a, b);
  const bc = sub(c, b);
  const denom = len(ba) * len(bc);
  if (denom < 1e-10) return 0;
  let cosAngle = dot(ba, bc) / denom;
  cosAngle = Math.max(-1, Math.min(1, cosAngle));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

function angleBetweenVectors(a: Vec3, b: Vec3): number {
  const denom = len(a) * len(b);
  if (denom < 1e-10) return 0;
  let cosAngle = dot(a, b) / denom;
  cosAngle = Math.max(-1, Math.min(1, cosAngle));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

function normalizeYaw(diff: number): number {
  return ((diff + 180) % 360 + 360) % 360 - 180;
}

function boneDirection(q: { x: number; y: number; z: number; w: number }): Vec3 {
  return {
    x: 2 * (q.w * q.z - q.x * q.y),
    y: 1 - 2 * (q.y * q.y + q.w * q.w),
    z: -2 * (q.w * q.x + q.y * q.z),
  };
}

function jointAngleFromRotations(
  data: Map<BodyPart, BoneT>,
  parentBp: BodyPart,
  childBp: BodyPart,
): number | null {
  const parent = data.get(parentBp);
  const child = data.get(childBp);
  if (!parent?.rotationG || !child?.rotationG) return null;
  return 180 - angleBetweenVectors(boneDirection(parent.rotationG), boneDirection(child.rotationG));
}

export function extractJointAngles(bones: BoneT[]): JointAngles {
  const data = new Map<BodyPart, BoneT>();
  for (const b of bones) {
    data.set(b.bodyPart, b);
  }

  const getPos = (bp: BodyPart): Vec3 | null => {
    const bone = data.get(bp);
    if (!bone || !bone.headPositionG) return null;
    return { x: bone.headPositionG.x, y: bone.headPositionG.y, z: bone.headPositionG.z };
  };

  const getRot = (bp: BodyPart) => {
    const bone = data.get(bp);
    if (!bone || !bone.rotationG) return null;
    return bone.rotationG;
  };

  const leftElbow = (() => {
    const a = getPos(BodyPart.LEFT_UPPER_ARM);
    const b = getPos(BodyPart.LEFT_LOWER_ARM);
    const c = getPos(BodyPart.LEFT_HAND);
    if (a && b && c) return threePointAngle(a, b, c);
    return jointAngleFromRotations(data, BodyPart.LEFT_UPPER_ARM, BodyPart.LEFT_LOWER_ARM);
  })();

  const rightElbow = (() => {
    const a = getPos(BodyPart.RIGHT_UPPER_ARM);
    const b = getPos(BodyPart.RIGHT_LOWER_ARM);
    const c = getPos(BodyPart.RIGHT_HAND);
    if (a && b && c) return threePointAngle(a, b, c);
    return jointAngleFromRotations(data, BodyPart.RIGHT_UPPER_ARM, BodyPart.RIGHT_LOWER_ARM);
  })();

  const leftKnee = (() => {
    const a = getPos(BodyPart.LEFT_UPPER_LEG);
    const b = getPos(BodyPart.LEFT_LOWER_LEG);
    const c = getPos(BodyPart.LEFT_FOOT);
    if (a && b && c) return threePointAngle(a, b, c);
    return jointAngleFromRotations(data, BodyPart.LEFT_UPPER_LEG, BodyPart.LEFT_LOWER_LEG);
  })();

  const rightKnee = (() => {
    const a = getPos(BodyPart.RIGHT_UPPER_LEG);
    const b = getPos(BodyPart.RIGHT_LOWER_LEG);
    const c = getPos(BodyPart.RIGHT_FOOT);
    if (a && b && c) return threePointAngle(a, b, c);
    return jointAngleFromRotations(data, BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG);
  })();

  const torsoVec = (() => {
    const hip = getPos(BodyPart.HIP);
    const chest = getPos(BodyPart.UPPER_CHEST) ?? getPos(BodyPart.CHEST);
    if (!hip || !chest) return null;
    return sub(chest, hip);
  })();

  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };

  const leftShoulderAbduction = (() => {
    if (!torsoVec) return null;
    const shoulder = getPos(BodyPart.LEFT_UPPER_ARM);
    const elbow = getPos(BodyPart.LEFT_LOWER_ARM);
    if (!shoulder || !elbow) return null;
    const armVec = sub(elbow, shoulder);
    return 180 - angleBetweenVectors(torsoVec, armVec);
  })();

  const rightShoulderAbduction = (() => {
    if (!torsoVec) return null;
    const shoulder = getPos(BodyPart.RIGHT_UPPER_ARM);
    const elbow = getPos(BodyPart.RIGHT_LOWER_ARM);
    if (!shoulder || !elbow) return null;
    const armVec = sub(elbow, shoulder);
    return 180 - angleBetweenVectors(torsoVec, armVec);
  })();

  const leftHipFlexion = (() => {
    if (!torsoVec) return null;
    const hip = getPos(BodyPart.LEFT_UPPER_LEG);
    const knee = getPos(BodyPart.LEFT_LOWER_LEG);
    if (!hip || !knee) return null;
    const thighVec = sub(knee, hip);
    return 180 - angleBetweenVectors(torsoVec, thighVec);
  })();

  const rightHipFlexion = (() => {
    if (!torsoVec) return null;
    const hip = getPos(BodyPart.RIGHT_UPPER_LEG);
    const knee = getPos(BodyPart.RIGHT_LOWER_LEG);
    if (!hip || !knee) return null;
    const thighVec = sub(knee, hip);
    return 180 - angleBetweenVectors(torsoVec, thighVec);
  })();

  const trunkLean = torsoVec ? angleBetweenVectors(torsoVec, worldUp) : null;

  const spineRotationYaw = (() => {
    const chestRot = getRot(BodyPart.CHEST) ?? getRot(BodyPart.UPPER_CHEST);
    const hipRot = getRot(BodyPart.HIP);
    if (!chestRot || !hipRot) return null;
    return normalizeYaw(quaternionYaw(chestRot) - quaternionYaw(hipRot));
  })();

  return {
    leftElbow,
    rightElbow,
    leftKnee,
    rightKnee,
    leftShoulderAbduction,
    rightShoulderAbduction,
    leftHipFlexion,
    rightHipFlexion,
    trunkLean,
    spineRotationYaw,
    timestamp: performance.now(),
  };
}
