// Standalone mock-data test for the Yoga pose engine.
// Run with: npx tsx mock-test.ts   (from the gui-mocap/ directory)
//
// This bypasses the SlimeVR server / WebSocket / real trackers entirely.
// It builds a fake skeleton (array of {bodyPart, rotationG}) straight from
// each pose's own referenceRotations, feeds it into the real PoseEngine +
// scorePose logic frame-by-frame, and prints how the score/hold/completion
// evolves — exactly what the on-screen "Overall / Hold / Status" fields show.

import { BodyPart, BoneT } from 'solarxr-protocol';
import { PoseEngine } from './src/pose/PoseEngine';
import { PoseDefinition } from './src/pose/types';

import tadasana from './src/applications/yoga/poses/tadasana';
import vrikshasana from './src/applications/yoga/poses/vrikshasana';
import adhoMukhaSvanasana from './src/applications/yoga/poses/adhomukhasvanasana';

// --- helpers -----------------------------------------------------------

function perfectSkeleton(pose: PoseDefinition): BoneT[] {
  // Build a skeleton that exactly matches the pose's reference rotations.
  // Expect this to score ~1.0 and complete after holdDuration seconds.
  return pose.requiredJoints.map((bp) => {
    const ref = pose.referenceRotations[bp] ?? { x: 0, y: 0, z: 0, w: 1 };
    return {
      bodyPart: bp,
      rotationG: { x: ref.x, y: ref.y, z: ref.z, w: ref.w },
    } as unknown as BoneT;
  });
}

function neutralSkeleton(pose: PoseDefinition): BoneT[] {
  // A plain standing T-pose (identity quaternion everywhere) regardless of
  // what the target pose wants. Should score LOW for anything but Tadasana.
  return pose.requiredJoints.map((bp) => ({
    bodyPart: bp,
    rotationG: { x: 0, y: 0, z: 0, w: 1 },
  } as unknown as BoneT));
}

function noisy(skeleton: BoneT[], amount: number): BoneT[] {
  // Nudge each quaternion slightly to simulate real sensor jitter, then
  // re-normalize so it stays a valid unit quaternion.
  return skeleton.map((b: any) => {
    const q = b.rotationG;
    const nx = q.x + (Math.random() - 0.5) * amount;
    const ny = q.y + (Math.random() - 0.5) * amount;
    const nz = q.z + (Math.random() - 0.5) * amount;
    const nw = q.w + (Math.random() - 0.5) * amount;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1;
    return {
      bodyPart: b.bodyPart,
      rotationG: { x: nx / len, y: ny / len, z: nz / len, w: nw / len },
    } as unknown as BoneT;
  });
}

function runScenario(label: string, pose: PoseDefinition, skeletonFactory: () => BoneT[], seconds: number, dt: number) {
  console.log(`\n=== ${label}: "${pose.name}" ===`);
  const engine = new PoseEngine();
  engine.loadPose(pose);

  const steps = Math.round(seconds / dt);
  for (let i = 0; i <= steps; i++) {
    const skeleton = skeletonFactory();
    const result = engine.update(skeleton, dt);
    if (!result) continue;

    const t = (i * dt).toFixed(1);
    if (i % Math.max(1, Math.round(1 / dt)) === 0 || result.completionState === 'completed') {
      console.log(
        `t=${t}s  score=${result.overallScore.toFixed(3)}  state=${result.completionState.padEnd(9)}  hold=${result.holdElapsed.toFixed(1)}/${result.holdDuration}s` +
        (result.worstJoint !== undefined ? `  worstJoint=${BodyPart[result.worstJoint]}` : '')
      );
    }
    if (result.completionState === 'completed') {
      console.log(`✅ Completed at t=${t}s`);
      break;
    }
  }
  if (!engine.getCompleted()) {
    console.log(`❌ Did not complete within ${seconds}s`);
  }
}

// --- test matrix ---------------------------------------------------------

const DT = 0.1; // simulate a 10Hz update loop

console.log('############################################');
console.log('# 1) PERFECT pose match -> should COMPLETE  #');
console.log('############################################');
runScenario('Perfect match', tadasana, () => perfectSkeleton(tadasana), 8, DT);
runScenario('Perfect match', vrikshasana, () => perfectSkeleton(vrikshasana), 8, DT);
runScenario('Perfect match', adhoMukhaSvanasana, () => perfectSkeleton(adhoMukhaSvanasana), 8, DT);

console.log('\n############################################');
console.log('# 2) NEUTRAL T-pose -> should NOT complete  #');
console.log('#    (except Tadasana, which IS a T-pose)   #');
console.log('############################################');
runScenario('Neutral T-pose', tadasana, () => neutralSkeleton(tadasana), 8, DT);
runScenario('Neutral T-pose', vrikshasana, () => neutralSkeleton(vrikshasana), 8, DT);
runScenario('Neutral T-pose', adhoMukhaSvanasana, () => neutralSkeleton(adhoMukhaSvanasana), 8, DT);

console.log('\n############################################');
console.log('# 3) Perfect + small sensor jitter          #');
console.log('#    -> should still complete (tolerance)   #');
console.log('############################################');
runScenario('Jittery match', vrikshasana, () => noisy(perfectSkeleton(vrikshasana), 0.03), 8, DT);
runScenario('Jittery match', adhoMukhaSvanasana, () => noisy(perfectSkeleton(adhoMukhaSvanasana), 0.03), 8, DT);
