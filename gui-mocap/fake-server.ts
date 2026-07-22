// Fake SlimeVR data-feed server.
//
// Speaks the REAL solarxr-protocol flatbuffer messages over a WebSocket on
// port 21110 -- the exact port/protocol gui-mocap's ProtocolClient expects
// from the actual `core` server. This lets you see live skeleton movement
// and test the Yoga Trainer in the browser with ZERO physical trackers.
//
// Setup (run once):
//   cd ~/Documents/IMU_Reconstruction_SlimeVR/gui-mocap
//   pnpm add -D ws @types/ws
//
// Usage:
//   npx tsx fake-server.ts walk
//   npx tsx fake-server.ts yoga vrikshasana
//   npx tsx fake-server.ts yoga tadasana
//   npx tsx fake-server.ts yoga adho
//   npx tsx fake-server.ts sweep
//     Slowly sweeps both arms and both legs from hanging-down (0°) up to
//     straight-up (180°) and back, on a ~10s loop -- exists specifically to
//     exercise the 90°/180° green highlight in scene.ts without any physical
//     sensors. Watch each limb turn green as it crosses ~90° (horizontal)
//     and again at ~180° (straight up).
//
// Then just refresh http://localhost:5173 in the browser (or it'll pick up
// the new connection automatically) -- leave your `pnpm run dev` Vite
// server running in a separate terminal, this is a SEPARATE process.

import { WebSocketServer, WebSocket } from 'ws';
import * as flatbuffers from 'flatbuffers';
import {
  MessageBundleT,
  DataFeedMessageHeaderT,
  DataFeedMessage,
  DataFeedUpdateT,
  BoneT,
  QuatT,
  Vec3fT,
  BodyPart,
} from 'solarxr-protocol';
import { PoseDefinition } from './src/pose/types';
import tadasana from './src/applications/yoga/poses/tadasana';
import vrikshasana from './src/applications/yoga/poses/vrikshasana';
import adhoMukhaSvanasana from './src/applications/yoga/poses/adhomukhasvanasana';
import siddhasana from './src/applications/yoga/poses/siddhasana';


const PORT = 21110;

// --- CLI args ------------------------------------------------------------

const mode = (process.argv[2] ?? 'walk') as 'walk' | 'yoga' | 'sweep';
const poseArg = (process.argv[3] ?? 'vrikshasana').toLowerCase();

const POSES: Record<string, PoseDefinition> = {
  tadasana,
  vrikshasana,
  adho: adhoMukhaSvanasana,
  adhomukhasvanasana: adhoMukhaSvanasana,
  siddhasana,
};

const selectedPose = POSES[poseArg] ?? vrikshasana;

// Full body-part list the 3D model needs (see scene.ts SLIMEVR_TO_MIXAMO order)
const ALL_BODY_PARTS: BodyPart[] = [
  BodyPart.HIP, BodyPart.WAIST, BodyPart.CHEST, BodyPart.UPPER_CHEST,
  BodyPart.NECK, BodyPart.HEAD,
  BodyPart.LEFT_UPPER_ARM, BodyPart.LEFT_LOWER_ARM, BodyPart.LEFT_HAND,
  BodyPart.RIGHT_UPPER_ARM, BodyPart.RIGHT_LOWER_ARM, BodyPart.RIGHT_HAND,
  BodyPart.LEFT_UPPER_LEG, BodyPart.LEFT_LOWER_LEG, BodyPart.LEFT_FOOT,
  BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG, BodyPart.RIGHT_FOOT,
];

// Standing-skeleton head positions (meters), only really needed once for the
// client's locomotion calibration (HIP / LEFT_FOOT / RIGHT_FOOT are required
// or updateRootAndPelvis bails out early).
const STANDING_POSITIONS: Partial<Record<BodyPart, [number, number, number]>> = {
  [BodyPart.HIP]:            [0, 0.92, 0],
  [BodyPart.WAIST]:          [0, 1.02, 0],
  [BodyPart.CHEST]:          [0, 1.20, 0],
  [BodyPart.UPPER_CHEST]:    [0, 1.35, 0],
  [BodyPart.NECK]:           [0, 1.45, 0],
  [BodyPart.HEAD]:           [0, 1.52, 0],
  [BodyPart.LEFT_UPPER_ARM]: [-0.18, 1.40, 0],
  [BodyPart.LEFT_LOWER_ARM]: [-0.20, 1.10, 0],
  [BodyPart.LEFT_HAND]:      [-0.22, 0.85, 0],
  [BodyPart.RIGHT_UPPER_ARM]:[0.18, 1.40, 0],
  [BodyPart.RIGHT_LOWER_ARM]:[0.20, 1.10, 0],
  [BodyPart.RIGHT_HAND]:     [0.22, 0.85, 0],
  [BodyPart.LEFT_UPPER_LEG]: [-0.10, 0.90, 0],
  [BodyPart.LEFT_LOWER_LEG]: [-0.10, 0.48, 0],
  [BodyPart.LEFT_FOOT]:      [-0.10, 0.05, 0],
  [BodyPart.RIGHT_UPPER_LEG]:[0.10, 0.90, 0],
  [BodyPart.RIGHT_LOWER_LEG]:[0.10, 0.48, 0],
  [BodyPart.RIGHT_FOOT]:     [0.10, 0.05, 0],
};

// --- quaternion helpers ----------------------------------------------------

const DEG = Math.PI / 180;

function quatX(deg: number): QuatT {
  const r = (deg * DEG) / 2;
  return new QuatT(Math.sin(r), 0, 0, Math.cos(r));
}

function quatY(deg: number): QuatT {
  const r = (deg * DEG) / 2;
  return new QuatT(0, Math.sin(r), 0, Math.cos(r));
}

function identityQuat(): QuatT {
  return new QuatT(0, 0, 0, 1);
}

function makeBone(bp: BodyPart, q: QuatT): BoneT {
  const pos = STANDING_POSITIONS[bp] ?? [0, 0, 0];
  return new BoneT(bp, q, 0.1, new Vec3fT(pos[0], pos[1], pos[2]));
}

// Same as makeBone but with headPositionG left null. scene.ts's 90°/180°
// detection prefers comparing two joints' *positions*; when position data
// isn't available for a joint it falls back to that joint's own rotationG
// instead. We want the sweep test to exercise that rotation-only path (since
// we're only animating rotations here, not positions), so the swept limb
// joints are sent with no position at all.
function makeBoneNoPos(bp: BodyPart, q: QuatT): BoneT {
  return new BoneT(bp, q, 0.1, null);
}

// --- animation: walk cycle -------------------------------------------------

function buildWalkBones(t: number): BoneT[] {
  const PERIOD = 1.1; // seconds per full gait cycle
  const phase = (t / PERIOD) * 2 * Math.PI;

  const legSwing = 22; // degrees, hip flexion/extension amplitude
  const kneeBend = 35; // degrees, max knee flexion during swing

  const leftHipAngle = legSwing * Math.sin(phase);
  const rightHipAngle = legSwing * Math.sin(phase + Math.PI);

  // Knee bends mostly during the forward-swing half of the cycle
  const leftKnee = Math.max(0, kneeBend * Math.sin(phase + Math.PI / 2 + 0.3));
  const rightKnee = Math.max(0, kneeBend * Math.sin(phase + Math.PI + Math.PI / 2 + 0.3));

  const armSwing = 18;
  const leftArmAngle = armSwing * Math.sin(phase + Math.PI); // opposite to left leg
  const rightArmAngle = armSwing * Math.sin(phase);

  const waistTwist = 4 * Math.sin(phase);
  const headBob = 1.5 * Math.sin(phase * 2);

  const rotations: Partial<Record<BodyPart, QuatT>> = {
    [BodyPart.HIP]: quatY(waistTwist * 0.5),
    [BodyPart.WAIST]: quatY(waistTwist),
    [BodyPart.CHEST]: quatY(-waistTwist * 0.5),
    [BodyPart.UPPER_CHEST]: identityQuat(),
    [BodyPart.NECK]: quatX(headBob * 0.3),
    [BodyPart.HEAD]: quatX(headBob),

    [BodyPart.LEFT_UPPER_ARM]: quatX(leftArmAngle),
    [BodyPart.LEFT_LOWER_ARM]: quatX(Math.max(0, -leftArmAngle * 0.4)),
    [BodyPart.LEFT_HAND]: identityQuat(),
    [BodyPart.RIGHT_UPPER_ARM]: quatX(rightArmAngle),
    [BodyPart.RIGHT_LOWER_ARM]: quatX(Math.max(0, -rightArmAngle * 0.4)),
    [BodyPart.RIGHT_HAND]: identityQuat(),

    [BodyPart.LEFT_UPPER_LEG]: quatX(leftHipAngle),
    [BodyPart.LEFT_LOWER_LEG]: quatX(leftKnee),
    [BodyPart.LEFT_FOOT]: identityQuat(),
    [BodyPart.RIGHT_UPPER_LEG]: quatX(rightHipAngle),
    [BodyPart.RIGHT_LOWER_LEG]: quatX(rightKnee),
    [BodyPart.RIGHT_FOOT]: identityQuat(),
  };

  return ALL_BODY_PARTS.map((bp) => makeBone(bp, rotations[bp] ?? identityQuat()));
}

// --- animation: 90°/180° sweep test -----------------------------------------
// Deliberately simple: both arms and both legs swing together from hanging
// straight down (0°) up to straight overhead/forward (180°) and back down, on
// a slow loop so you have time to watch the highlight react. Upper and lower
// segments of each limb get the SAME angle (keeps the limb visually straight
// instead of folding at the elbow/knee -- see the pose-file comments for why
// mismatched segment angles bend a joint).
function buildSweepBones(t: number): BoneT[] {
  const PERIOD = 10; // seconds for a full 0deg -> 180deg -> 0deg loop
  const phase = (t / PERIOD) * 2 * Math.PI;
  const angle = 90 * (1 - Math.cos(phase)); // 0 -> 180 -> 0, smooth start/end

  const q = quatX(angle);

  const rotations: Partial<Record<BodyPart, QuatT>> = {
    [BodyPart.HIP]: identityQuat(),
    [BodyPart.WAIST]: identityQuat(),
    [BodyPart.CHEST]: identityQuat(),
    [BodyPart.UPPER_CHEST]: identityQuat(),
    [BodyPart.NECK]: identityQuat(),
    [BodyPart.HEAD]: identityQuat(),

    [BodyPart.LEFT_UPPER_ARM]: q,
    [BodyPart.LEFT_LOWER_ARM]: q,
    [BodyPart.LEFT_HAND]: identityQuat(),
    [BodyPart.RIGHT_UPPER_ARM]: q,
    [BodyPart.RIGHT_LOWER_ARM]: q,
    [BodyPart.RIGHT_HAND]: identityQuat(),

    [BodyPart.LEFT_UPPER_LEG]: q,
    [BodyPart.LEFT_LOWER_LEG]: q,
    [BodyPart.LEFT_FOOT]: identityQuat(),
    [BodyPart.RIGHT_UPPER_LEG]: q,
    [BodyPart.RIGHT_LOWER_LEG]: q,
    [BodyPart.RIGHT_FOOT]: identityQuat(),
  };

  const NO_POS: Set<BodyPart> = new Set([
    BodyPart.LEFT_UPPER_ARM, BodyPart.LEFT_LOWER_ARM,
    BodyPart.RIGHT_UPPER_ARM, BodyPart.RIGHT_LOWER_ARM,
    BodyPart.LEFT_UPPER_LEG, BodyPart.LEFT_LOWER_LEG,
    BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG,
  ]);

  return ALL_BODY_PARTS.map((bp) => {
    const rot = rotations[bp] ?? identityQuat();
    return NO_POS.has(bp) ? makeBoneNoPos(bp, rot) : makeBone(bp, rot);
  });
}



const YOGA_NO_POS: Set<BodyPart> = new Set([
  BodyPart.LEFT_UPPER_ARM, BodyPart.LEFT_LOWER_ARM,
  BodyPart.RIGHT_UPPER_ARM, BodyPart.RIGHT_LOWER_ARM,
  BodyPart.LEFT_UPPER_LEG, BodyPart.LEFT_LOWER_LEG,
  BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG,
]);

function buildYogaBones(pose: PoseDefinition): BoneT[] {
  return ALL_BODY_PARTS.map((bp) => {
    const ref = pose.referenceRotations[bp];
    const q = ref ? new QuatT(ref.x, ref.y, ref.z, ref.w) : identityQuat();
    return YOGA_NO_POS.has(bp) ? makeBoneNoPos(bp, q) : makeBone(bp, q);
  });
}

// --- flatbuffer message construction ---------------------------------------

function buildMessage(bones: BoneT[], index: number): Uint8Array {
  const update = new DataFeedUpdateT([], [], bones, null, index, null);
  const hdr = new DataFeedMessageHeaderT(DataFeedMessage.DataFeedUpdate, update);
  const bundle = new MessageBundleT();
  bundle.dataFeedMsgs = [hdr];

  const builder = new flatbuffers.Builder(2048);
  const offset = bundle.pack(builder);
  builder.finish(offset);
  return builder.asUint8Array();
}

// --- server ------------------------------------------------------------

const wss = new WebSocketServer({ port: PORT });
console.log(`Fake data-feed server listening on ws://localhost:${PORT}`);
console.log(`Mode: ${mode}${mode === 'yoga' ? `  Pose: ${selectedPose.name}` : ''}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected -- streaming synthetic skeleton data');
  let index = 0;
  const startTime = Date.now();

  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    const t = (Date.now() - startTime) / 1000;

    const bones = mode === 'walk' ? buildWalkBones(t) : mode === 'sweep' ? buildSweepBones(t) : buildYogaBones(selectedPose);
    const bytes = buildMessage(bones, index++);
    ws.send(bytes);
  }, 33); // ~30Hz

  ws.on('message', () => {
    // We ignore StartDataFeed/config requests from the client and just
    // stream unconditionally -- good enough for a visual smoke test.
  });

  ws.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });
});
