import { BiomechanicsAnalysisPipeline } from './pipeline';
import { BodyPart, type JointId } from './model';
import { MotionHistoryBuffer } from './history';
import type { CanonicalPoseFrame } from '../types';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const quarterTurnX = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

function frame(receivedAt: number, lowerArmRotation = identity, hipX = 0): CanonicalPoseFrame {
  const positions = new Map<number, { x: number; y: number; z: number }>([
    [BodyPart.HIP, { x: hipX, y: 1, z: 0 }], [BodyPart.UPPER_CHEST, { x: hipX, y: 1.5, z: 0 }],
    [BodyPart.LEFT_UPPER_ARM, { x: hipX - .35, y: 1.45, z: 0 }], [BodyPart.LEFT_LOWER_ARM, { x: hipX - .65, y: 1.35, z: 0 }], [BodyPart.LEFT_HAND, { x: hipX - .85, y: 1.3, z: 0 }],
    [BodyPart.RIGHT_UPPER_ARM, { x: hipX + .35, y: 1.45, z: 0 }], [BodyPart.RIGHT_LOWER_ARM, { x: hipX + .65, y: 1.35, z: 0 }], [BodyPart.RIGHT_HAND, { x: hipX + .85, y: 1.3, z: 0 }],
    [BodyPart.LEFT_UPPER_LEG, { x: hipX - .14, y: .75, z: 0 }], [BodyPart.LEFT_LOWER_LEG, { x: hipX - .14, y: .3, z: 0 }], [BodyPart.LEFT_FOOT, { x: hipX - .14, y: .05, z: .15 }],
    [BodyPart.RIGHT_UPPER_LEG, { x: hipX + .14, y: .75, z: 0 }], [BodyPart.RIGHT_LOWER_LEG, { x: hipX + .14, y: .3, z: 0 }], [BodyPart.RIGHT_FOOT, { x: hipX + .14, y: .05, z: .15 }],
  ]);
  const bones = new Map([...positions.entries()].map(([bodyPart, position]) => [bodyPart, { bodyPart, position, rotation: bodyPart === BodyPart.LEFT_LOWER_ARM ? lowerArmRotation : identity, length: 0 }]));
  return { receivedAt, bones, trackedBodyParts: bones.size };
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- Basic pipeline flow ---
const pipeline = new BiomechanicsAnalysisPipeline({ historyCapacity: 3 });
const first = pipeline.analyze(frame(1_000));
const second = pipeline.analyze(frame(1_020, quarterTurnX, .01));

expect(first.validation.valid, 'complete frame should be valid');
expect(first.temporal.flags.includes('insufficientHistory'), 'first frame should declare its history limitation');
expect(second.jointAngles.get('leftElbow')?.available, 'left elbow should be available from two tracked rotations');
expect(Math.abs(second.jointAngles.get('leftElbow')!.flexionExtension! - 90) < .01, 'relative elbow flexion should use the shared X-axis convention');
expect(second.features.bones.get(BodyPart.LEFT_LOWER_ARM)?.angularVelocityDegPerSec !== null, 'angular velocity should use retained history');
expect(second.features.centerOfMass.speed !== null, 'center-of-mass speed should use retained history');

// --- Tracking quality ---
expect(second.features.trackingQuality.overall > 0, 'tracking quality overall should be positive');
expect(second.features.trackingQuality.rotationQuality === 1, 'all bones should have valid rotations');
expect(second.features.trackingQuality.positionQuality === 1, 'all bones should have valid positions');
expect(second.features.trackingQuality.trackedBodyParts === 14, 'all 14 body parts should be tracked');

// --- Movement direction ---
const hipKinematics = second.features.bones.get(BodyPart.HIP);
expect(hipKinematics?.movementDirection !== null, 'hip movement direction should be computed from position delta');
expect(hipKinematics?.movementDirection!.x > 0, 'hip movement direction should be positive X (hipX went from 0 to 0.01)');

// --- Missing bone handling ---
function frameMissingBone(receivedAt: number): CanonicalPoseFrame {
  const bones = new Map<number, { bodyPart: number; rotation: typeof identity; position: { x: number; y: number; z: number }; length: number }>();
  bones.set(BodyPart.HIP, { bodyPart: BodyPart.HIP, position: { x: 0, y: 1, z: 0 }, rotation: identity, length: 0 });
  bones.set(BodyPart.UPPER_CHEST, { bodyPart: BodyPart.UPPER_CHEST, position: { x: 0, y: 1.5, z: 0 }, rotation: identity, length: 0 });
  return { receivedAt, bones, trackedBodyParts: bones.size };
}
const partialPipe = new BiomechanicsAnalysisPipeline();
const partial = partialPipe.analyze(frameMissingBone(1_000));
expect(partial.validation.valid, 'partial frame with valid data should still be valid');
expect(partial.validation.missingRotation.length === 0, 'present bones all have rotations; no missing rotation entries');
expect(partial.validation.missingPosition.length === 0, 'present bones all have positions; no missing position entries');
expect(partial.validation.presentBodyParts === 2, 'only the two explicitly provided bones should be counted as present');
expect(partial.jointAngles.get('neck' as JointId)?.available === false, 'neck angle should be unavailable when distal bone missing');
expect(partial.features.trackingQuality.rotationQuality === 1, 'all present bones have valid rotations, so rotation quality is perfect');
expect(partial.features.trackingQuality.trackedBodyParts === 2, 'tracking quality reflects the limited tracked body parts');

// --- History window ---
function historyWindowTest(): void {
  const buf = new MotionHistoryBuffer(10);
  for (let i = 0; i < 5; i++) {
    const f = frame(i * 16);
    const pipe = new BiomechanicsAnalysisPipeline();
    const result = pipe.analyze(f);
    buf.push({ pose: f, result });
  }
  const window = buf.getWindow(80, 40);
  expect(window.length >= 2, 'getWindow should return entries within the time window');
}
historyWindowTest();

// --- Multiple frame kinematics chain with angular acceleration ---
const chainPipe = new BiomechanicsAnalysisPipeline();
const f1 = chainPipe.analyze(frame(0));
const f2 = chainPipe.analyze(frame(16, identity, 0.01));
const f3 = chainPipe.analyze(frame(32, quarterTurnX, 0.03));
const f4 = chainPipe.analyze(frame(48, quarterTurnX, 0.06));
const lowerArmAccel = f4.features.bones.get(BodyPart.LEFT_LOWER_ARM)?.angularAccelerationDegPerSec2;
expect(lowerArmAccel !== null, 'angular acceleration should be available after 3+ frames with varying angular velocity');
expect(f4.features.trackingQuality.overall > 0, 'tracking quality should remain high');

console.info('Analysis engine checks passed.');
