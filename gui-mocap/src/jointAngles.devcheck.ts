// Run: npx tsx src/jointAngles.devcheck.ts

// Import from the actual source since npx tsx doesn't use Vite aliases.
import { BoneT, BodyPart, QuatT, Vec3fT } from 'solarxr-protocol';
import { extractJointAngles } from './jointAngles';

function b(bodyPart: BodyPart, x: number, y: number, z: number): BoneT {
  return new BoneT(bodyPart, null, 0, new Vec3fT(x, y, z));
}

function br(bodyPart: BodyPart, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): BoneT {
  return new BoneT(bodyPart, new QuatT(qx, qy, qz, qw), 0, new Vec3fT(x, y, z));
}

function bonly(bodyPart: BodyPart, qx: number, qy: number, qz: number, qw: number): BoneT {
  return new BoneT(bodyPart, new QuatT(qx, qy, qz, qw), 0, null);
}

let exitCode = 0;

const pass = (name: string) => console.log(`  PASS: ${name}`);
const fail = (name: string, msg?: string) => { console.error(`  FAIL: ${name}${msg ? ' — ' + msg : ''}`); exitCode = 1; };

function assertApprox(actual: number | null, expected: number, tolerance: number, name: string): void {
  if (actual === null) { fail(name, 'got null'); return; }
  if (Math.abs(actual - expected) > tolerance) { fail(name, `expected ~${expected}, got ${actual}`); return; }
  pass(name);
}

function assertNull(actual: number | null, name: string): void {
  if (actual !== null) { fail(name, `expected null, got ${actual}`); return; }
  pass(name);
}

function assertNotNull(actual: number | null, name: string): void {
  if (actual === null) { fail(name, 'got null'); return; }
  pass(name);
}

console.log('jointAngles devcheck\n');

// ---- 1. Straight arm: elbow ~180° ----
{
  const bones: BoneT[] = [
    b(BodyPart.LEFT_UPPER_ARM, 0, 0, 1),
    b(BodyPart.LEFT_LOWER_ARM, 0, 0, 0),
    b(BodyPart.LEFT_HAND, 0, 0, -1),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftElbow, 180, 0.5, 'straight arm → leftElbow ~180°');
  assertNotNull(angles.timestamp, 'timestamp is not null');
}

// ---- 2. 90° bent elbow ----
{
  const bones: BoneT[] = [
    b(BodyPart.LEFT_UPPER_ARM, 0, 0, 1),
    b(BodyPart.LEFT_LOWER_ARM, 0, 0, 0),
    b(BodyPart.LEFT_HAND, 0, -1, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftElbow, 90, 0.5, '90° bent arm → leftElbow ~90°');
}

// ---- 3. Straight knee ~180° ----
{
  const bones: BoneT[] = [
    b(BodyPart.LEFT_UPPER_LEG, 0, -0.4, 0),
    b(BodyPart.LEFT_LOWER_LEG, 0, -0.8, 0),
    b(BodyPart.LEFT_FOOT, 0, -1.2, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftKnee, 180, 0.5, 'straight leg → leftKnee ~180°');
}

// ---- 4. 90° bent knee ----
{
  const bones: BoneT[] = [
    b(BodyPart.LEFT_UPPER_LEG, 0, -0.4, 0),
    b(BodyPart.LEFT_LOWER_LEG, 0, -0.8, 0),
    b(BodyPart.LEFT_FOOT, 0.4, -0.8, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftKnee, 90, 0.5, '90° bent leg → leftKnee ~90°');
}

// ---- 5. Missing bone → null, no throw ----
{
  const bones: BoneT[] = [
    b(BodyPart.RIGHT_UPPER_ARM, 0, 0, 1),
    b(BodyPart.RIGHT_LOWER_ARM, 0, 0, 0),
    b(BodyPart.RIGHT_HAND, 0, 0, -1),
  ];
  let threw = false;
  let result: ReturnType<typeof extractJointAngles> | undefined;
  try {
    result = extractJointAngles(bones);
  } catch {
    threw = true;
  }
  if (threw) {
    fail('missing bones → should not throw');
  } else {
    pass('missing bones → does not throw');
    assertNull(result!.leftElbow, 'missing LEFT arm → leftElbow null');
  }
}

// ---- 6. Straight arm right side ----
{
  const bones: BoneT[] = [
    b(BodyPart.RIGHT_UPPER_ARM, 0, 0, 1),
    b(BodyPart.RIGHT_LOWER_ARM, 0, 0, 0),
    b(BodyPart.RIGHT_HAND, 0, 0, -1),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.rightElbow, 180, 0.5, 'straight right arm → rightElbow ~180°');
}

// ---- 7. Vertical torso → trunkLean ~0° ----
{
  const bones: BoneT[] = [
    b(BodyPart.HIP, 0, 0, 0),
    b(BodyPart.UPPER_CHEST, 0, 1, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.trunkLean, 0, 0.5, 'vertical torso → trunkLean ~0°');
}

// ---- 8. 45° trunk lean ----
{
  const d = Math.SQRT1_2; // ~0.7071
  const bones: BoneT[] = [
    b(BodyPart.HIP, 0, 0, 0),
    b(BodyPart.UPPER_CHEST, d, d, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.trunkLean, 45, 0.5, '45° torso → trunkLean ~45°');
}

// ---- 9. Shoulder abduction: hanging arm (torso up, arm down) → ~0° ----
{
  const bones: BoneT[] = [
    b(BodyPart.HIP, 0, 0, 0),
    b(BodyPart.UPPER_CHEST, 0, 1, 0),
    b(BodyPart.LEFT_UPPER_ARM, 0, 0.9, 0),
    b(BodyPart.LEFT_LOWER_ARM, 0, 0.5, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftShoulderAbduction, 0, 0.5, 'arm down → shoulder abduction ~0°');
}

// ---- 10. Shoulder abduction: arm out sideways (~90°) ----
{
  const bones: BoneT[] = [
    b(BodyPart.HIP, 0, 0, 0),
    b(BodyPart.UPPER_CHEST, 0, 1, 0),
    b(BodyPart.LEFT_UPPER_ARM, 0, 0.9, 0),
    b(BodyPart.LEFT_LOWER_ARM, 0, 0.9, 0.4),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftShoulderAbduction, 90, 0.5, 'arm out sideways → shoulder abduction ~90°');
}

// ---- 11. Hip flexion: standing straight (torso up, thigh down) → ~0° ----
{
  const bones: BoneT[] = [
    b(BodyPart.HIP, 0, 0, 0),
    b(BodyPart.UPPER_CHEST, 0, 1, 0),
    b(BodyPart.LEFT_UPPER_LEG, 0, -0.1, 0),
    b(BodyPart.LEFT_LOWER_LEG, 0, -0.6, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftHipFlexion, 0, 0.5, 'standing straight → hip flexion ~0°');
}

// ---- 12. Hip flexion: leg forward 45° → ~45° ----
{
  const d = Math.SQRT1_2;
  const bones: BoneT[] = [
    b(BodyPart.HIP, 0, 0, 0),
    b(BodyPart.UPPER_CHEST, 0, 1, 0),
    b(BodyPart.LEFT_UPPER_LEG, 0, -0.1, 0),
    b(BodyPart.LEFT_LOWER_LEG, d, -0.1 + -d, 0), // thigh angled at 45°
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftHipFlexion, 45, 0.5, 'leg forward 45° → hip flexion ~45°');
}

// ---- 13. Spine rotation yaw: chest rotated 30° vs hip ----
{
  const halfAngle = Math.PI / 12; // 15°
  const bones: BoneT[] = [
    br(BodyPart.HIP, 0, 0, 0, 0, 0, 0, 1),        // identity quaternion
    br(BodyPart.CHEST, 0, 1, 0, 0, Math.sin(halfAngle), 0, Math.cos(halfAngle)), // 30° yaw
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.spineRotationYaw, 30, 1, 'chest yaw 30° → spineRotationYaw ~30°');
}

// ---- 14. Spine rotation yaw: chest rotated -30° vs hip ----
{
  const halfAngle = -Math.PI / 12;
  const bones: BoneT[] = [
    br(BodyPart.HIP, 0, 0, 0, 0, 0, 0, 1),
    br(BodyPart.CHEST, 0, 1, 0, 0, Math.sin(halfAngle), 0, Math.cos(halfAngle)),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.spineRotationYaw, -30, 1, 'chest yaw -30° → spineRotationYaw ~-30°');
}

// ---- 15. Rotation fallback: elbow straight (no hand bone) → ~180° ----
{
  const bones: BoneT[] = [
    bonly(BodyPart.LEFT_UPPER_ARM, 0, 0, 0, 1), // identity: bone points (0, -1, 0)
    bonly(BodyPart.LEFT_LOWER_ARM, 0, 0, 0, 1), // identity: same direction
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftElbow, 180, 0.5, 'rotation fallback: straight elbow ~180°');
}

// ---- 16. Rotation fallback: elbow 90° (no hand bone) ----
{
  // Upper arm points -Y (identity). Lower arm rotated 90° around X → points -Z.
  const halfAngle = Math.PI / 4;
  const bones: BoneT[] = [
    bonly(BodyPart.LEFT_UPPER_ARM, 0, 0, 0, 1),
    bonly(BodyPart.LEFT_LOWER_ARM, Math.sin(halfAngle), 0, 0, Math.cos(halfAngle)), // 90° X rotation
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftElbow, 90, 1, 'rotation fallback: 90° elbow ~90°');
}

// ---- 17. Rotation fallback: knee straight (no foot bone) → ~180° ----
{
  const bones: BoneT[] = [
    bonly(BodyPart.LEFT_UPPER_LEG, 0, 0, 0, 1),
    bonly(BodyPart.LEFT_LOWER_LEG, 0, 0, 0, 1),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftKnee, 180, 0.5, 'rotation fallback: straight knee ~180°');
}

// ---- 18. Rotation fallback: knee 90° (no foot bone) ----
{
  const halfAngle = Math.PI / 4;
  const bones: BoneT[] = [
    bonly(BodyPart.LEFT_UPPER_LEG, 0, 0, 0, 1),
    bonly(BodyPart.LEFT_LOWER_LEG, Math.sin(halfAngle), 0, 0, Math.cos(halfAngle)), // 90° X rotation
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.leftKnee, 90, 1, 'rotation fallback: 90° knee ~90°');
}

// ---- 19. Torso from CHEST (UPPER_CHEST absent) → trunk lean ~0° ----
{
  const bones: BoneT[] = [
    b(BodyPart.HIP, 0, 0, 0),
    b(BodyPart.CHEST, 0, 1, 0),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.trunkLean, 0, 0.5, 'CHEST fallback: trunk lean ~0°');
}

// ---- 20. Spine yaw from UPPER_CHEST (CHEST absent) → ~30° ----
{
  const halfAngle = Math.PI / 12;
  const bones: BoneT[] = [
    br(BodyPart.HIP, 0, 0, 0, 0, 0, 0, 1),
    br(BodyPart.UPPER_CHEST, 0, 1, 0, 0, Math.sin(halfAngle), 0, Math.cos(halfAngle)),
  ];
  const angles = extractJointAngles(bones);
  assertApprox(angles.spineRotationYaw, 30, 1, 'UPPER_CHEST fallback: spine yaw ~30°');
}

// ---- 21. Empty input → all null, no throw ----
{
  let threw = false;
  let result: ReturnType<typeof extractJointAngles> | undefined;
  try {
    result = extractJointAngles([]);
  } catch {
    threw = true;
  }
  if (threw) {
    fail('empty input → should not throw');
  } else {
    pass('empty input → does not throw');
    assertNull(result!.leftElbow, 'empty → leftElbow null');
    assertNull(result!.rightElbow, 'empty → rightElbow null');
    assertNull(result!.trunkLean, 'empty → trunkLean null');
    assertNull(result!.spineRotationYaw, 'empty → spineRotationYaw null');
  }
}

console.log('\nDone.');
