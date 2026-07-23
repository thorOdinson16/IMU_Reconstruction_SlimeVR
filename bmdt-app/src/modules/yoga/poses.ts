import type { ReferencePose } from '../../analysis';
import type { JointWeight } from '../../analysis/scoring';

export interface YogaPoseEntry {
  pose: ReferencePose;
  weights: JointWeight[];
  description: string;
  instructions: string[];
  benefits: string[];
  commonMistakes: string[];
  cautions: string[];
  holdDurationSec: number;
  transitionDurationSec: number;
}

interface TargetDef {
  jointId: string;
  fe?: [number, number];
  aa?: [number, number];
  ir?: [number, number];
}

const BASE_TARGETS = [
  { id: 'neck' as const, fe: [-15, 15], aa: [-10, 10], ir: [-15, 15] },
  { id: 'spine' as const, fe: [-10, 20], aa: [-10, 10], ir: [-10, 10] },
  { id: 'leftShoulder' as const, fe: [-30, 80], aa: [-10, 30], ir: [-30, 30] },
  { id: 'rightShoulder' as const, fe: [-30, 80], aa: [-30, 10], ir: [-30, 30] },
  { id: 'leftElbow' as const, fe: [0, 10], aa: [-5, 5], ir: [-10, 10] },
  { id: 'rightElbow' as const, fe: [0, 10], aa: [-5, 5], ir: [-10, 10] },
  { id: 'leftHip' as const, fe: [-10, 10], aa: [-5, 5], ir: [-10, 10] },
  { id: 'rightHip' as const, fe: [-10, 10], aa: [-5, 5], ir: [-10, 10] },
  { id: 'leftKnee' as const, fe: [0, 10], aa: [-5, 5], ir: [-10, 10] },
  { id: 'rightKnee' as const, fe: [0, 10], aa: [-5, 5], ir: [-10, 10] },
];

function makeTargets(overrides: TargetDef[]): ReferencePose['targets'] {
  return BASE_TARGETS.map((t) => {
    const o = overrides.find((ov) => ov.jointId === t.id);
    return {
      jointId: t.id,
      flexionExtension: { min: o?.fe?.[0] ?? t.fe[0], max: o?.fe?.[1] ?? t.fe[1] },
      abductionAdduction: { min: o?.aa?.[0] ?? t.aa[0], max: o?.aa?.[1] ?? t.aa[1] },
      internalExternalRotation: { min: o?.ir?.[0] ?? t.ir[0], max: o?.ir?.[1] ?? t.ir[1] },
    };
  });
}

function makeWeights(map: Record<string, number>): JointWeight[] {
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  const uniform = 1 / BASE_TARGETS.length;
  return BASE_TARGETS.map((t) => ({
    jointId: t.id,
    weight: (map[t.id] ?? uniform) / (total > 0 ? total : 1),
  }));
}

const SW = [5, 6, 7, 8, 9];
const FULL = [5, 6, 7, 8, 9, 16, 17];

function entry(
  id: string, name: string, sanskrit: string, category: string, difficulty: 'beginner' | 'intermediate' | 'advanced',
  overrides: TargetDef[], weights: Record<string, number>, requiredBones: number[],
  desc: string, instr: string[], benefits: string[], mistakes: string[], cautions: string[],
  holdSec: number, transSec: number, extraMeta?: Record<string, string>,
): YogaPoseEntry {
  const targets = makeTargets(overrides);
  return {
    pose: { id, name, category, difficulty, targets, requiredBones, metadata: { sanskrit, ...extraMeta } },
    weights: makeWeights(weights),
    description: desc, instructions: instr, benefits, commonMistakes: mistakes, cautions,
    holdDurationSec: holdSec, transitionDurationSec: transSec,
  };
}

export const yogaPoses: YogaPoseEntry[] = [
  entry('mountain', 'Mountain Pose', 'Tadasana', 'Standing', 'beginner',
    [], {}, SW,
    'Stand tall with feet together, arms at sides, weight evenly distributed.',
    [
      'Stand with feet together, arms at your sides.',
      'Engage your thighs and lift your kneecaps.',
      'Lengthen your tailbone toward the floor.',
      'Draw your shoulders back and down.',
    ],
    ['Improves posture and body awareness', 'Strengthens thighs and knees'],
    ['Locking the knees', 'Rounding the shoulders forward'],
    ['Avoid if you have low blood pressure'],
    30, 5),

  entry('warrior-i', 'Warrior I', 'Virabhadrasana I', 'Standing', 'intermediate',
    [
      { jointId: 'leftHip', fe: [40, 80] }, { jointId: 'rightHip', fe: [-5, 15] },
      { jointId: 'leftKnee', fe: [40, 80] }, { jointId: 'rightKnee', fe: [0, 10] },
      { jointId: 'leftShoulder', fe: [130, 180] }, { jointId: 'rightShoulder', fe: [130, 180] },
      { jointId: 'spine', fe: [0, 15] },
    ],
    { leftHip: 3, rightHip: 2, leftKnee: 3, rightKnee: 2, leftShoulder: 2, rightShoulder: 2, spine: 2 }, SW,
    'Front knee bent at 90°, back leg straight, arms raised overhead with hips squared forward.',
    [
      'Step your left foot forward into a lunge, back foot at 45°.',
      'Bend your left knee to align over your ankle.',
      'Keep your back leg straight and strong.',
      'Square your hips to face forward.',
      'Raise both arms overhead, palms facing each other.',
    ],
    ['Strengthens legs and core', 'Opens hips and chest', 'Improves balance and focus'],
    ['Front knee extending past the ankle', 'Back foot collapsing outward', 'Hips rotating open to the side'],
    ['Avoid if you have knee or hip injuries', 'Take care with high blood pressure'],
    25, 8, { side: 'left' }),

  entry('warrior-i-right', 'Warrior I (Right)', 'Virabhadrasana I', 'Standing', 'intermediate',
    [
      { jointId: 'rightHip', fe: [40, 80] }, { jointId: 'leftHip', fe: [-5, 15] },
      { jointId: 'rightKnee', fe: [40, 80] }, { jointId: 'leftKnee', fe: [0, 10] },
      { jointId: 'leftShoulder', fe: [130, 180] }, { jointId: 'rightShoulder', fe: [130, 180] },
      { jointId: 'spine', fe: [0, 15] },
    ],
    { rightHip: 3, leftHip: 2, rightKnee: 3, leftKnee: 2, leftShoulder: 2, rightShoulder: 2, spine: 2 }, SW,
    'Mirror of Warrior I with the right leg forward.',
    [
      'Step your right foot forward into a lunge, back foot at 45°.',
      'Bend your right knee to align over your ankle.',
      'Keep your back leg straight and strong.',
      'Square your hips to face forward.',
      'Raise both arms overhead, palms facing each other.',
    ],
    ['Strengthens legs and core', 'Opens hips and chest', 'Improves balance and focus'],
    ['Front knee extending past the ankle', 'Back foot collapsing outward', 'Hips rotating open to the side'],
    ['Avoid if you have knee or hip injuries'],
    25, 8, { side: 'right' }),

  entry('warrior-ii', 'Warrior II', 'Virabhadrasana II', 'Standing', 'intermediate',
    [
      { jointId: 'leftHip', fe: [40, 80], aa: [-10, 10] }, { jointId: 'rightHip', fe: [-5, 15], aa: [-10, 10] },
      { jointId: 'leftKnee', fe: [40, 80] }, { jointId: 'rightKnee', fe: [0, 10] },
      { jointId: 'leftShoulder', fe: [40, 100], aa: [-60, -20] },
      { jointId: 'rightShoulder', fe: [40, 100], aa: [20, 70] },
      { jointId: 'spine', fe: [-5, 10] },
    ],
    { leftHip: 3, rightHip: 2, leftKnee: 3, rightKnee: 2, leftShoulder: 3, rightShoulder: 3, spine: 2 }, SW,
    'Front knee bent, back leg straight, arms extended parallel to the floor, gaze over front hand.',
    [
      'Step feet wide apart, 3-4 feet distance.',
      'Turn left foot forward, right foot at 90°.',
      'Bend left knee to 90°, aligning over the ankle.',
      'Extend arms out to the sides at shoulder height.',
      'Gaze over your left fingertips.',
      'Keep your torso upright and spine long.',
    ],
    ['Strengthens legs and ankles', 'Opens hips and chest', 'Builds endurance and stability'],
    ['Front knee collapsing inward', 'Leaning the torso forward', 'Arms dropping below shoulder height'],
    ['Avoid if you have chronic knee pain'],
    25, 8, { side: 'left' }),

  entry('warrior-ii-right', 'Warrior II (Right)', 'Virabhadrasana II', 'Standing', 'intermediate',
    [
      { jointId: 'rightHip', fe: [40, 80], aa: [-10, 10] }, { jointId: 'leftHip', fe: [-5, 15], aa: [-10, 10] },
      { jointId: 'rightKnee', fe: [40, 80] }, { jointId: 'leftKnee', fe: [0, 10] },
      { jointId: 'leftShoulder', fe: [40, 100], aa: [20, 70] },
      { jointId: 'rightShoulder', fe: [40, 100], aa: [-60, -20] },
      { jointId: 'spine', fe: [-5, 10] },
    ],
    { rightHip: 3, leftHip: 2, rightKnee: 3, leftKnee: 2, leftShoulder: 3, rightShoulder: 3, spine: 2 }, SW,
    'Mirror of Warrior II with the right leg forward.',
    [
      'Step feet wide apart, turn right foot forward.',
      'Bend right knee to 90°, align over ankle.',
      'Extend arms at shoulder height.',
      'Gaze over right fingertips.',
    ],
    ['Strengthens legs and ankles', 'Opens hips and chest'],
    ['Front knee collapsing inward', 'Leaning the torso forward'],
    ['Avoid if you have chronic knee pain'],
    25, 8, { side: 'right' }),

  entry('triangle', 'Triangle Pose', 'Trikonasana', 'Standing', 'intermediate',
    [
      { jointId: 'leftHip', fe: [0, 30] }, { jointId: 'rightHip', fe: [0, 30] },
      { jointId: 'leftKnee', fe: [0, 10] }, { jointId: 'rightKnee', fe: [0, 10] },
      { jointId: 'spine', fe: [-15, 10], aa: [-30, -10] },
      { jointId: 'leftShoulder', fe: [40, 100], aa: [30, 80] },
      { jointId: 'rightShoulder', fe: [40, 100], aa: [-60, -20] },
    ],
    { leftHip: 2, rightHip: 2, spine: 3, leftShoulder: 2, rightShoulder: 2, leftKnee: 2, rightKnee: 2 }, SW,
    'Legs wide, one arm reaches to the front foot, the other arm reaches upward.',
    [
      'Step feet wide apart, about 3-4 feet.',
      'Turn left foot forward, right foot at 90°.',
      'Extend arms to the sides at shoulder height.',
      'Reach forward and hinge at the hip, not the waist.',
      'Place your left hand on your shin or the floor.',
      'Reach your right arm straight up toward the ceiling.',
    ],
    ['Stretches hamstrings and hips', 'Opens chest and shoulders', 'Improves spinal mobility'],
    ['Bending at the waist instead of the hip', 'Forward arm collapsing', 'Head dropping forward'],
    ['Avoid if you have neck or spine injuries'],
    25, 8, { side: 'left' }),

  entry('downward-dog', 'Downward-Facing Dog', 'Adho Mukha Svanasana', 'Transition', 'intermediate',
    [
      { jointId: 'spine', fe: [10, 40] },
      { jointId: 'leftShoulder', fe: [80, 140] }, { jointId: 'rightShoulder', fe: [80, 140] },
      { jointId: 'leftElbow', fe: [0, 15] }, { jointId: 'rightElbow', fe: [0, 15] },
      { jointId: 'leftHip', fe: [60, 100] }, { jointId: 'rightHip', fe: [60, 100] },
      { jointId: 'leftKnee', fe: [0, 10] }, { jointId: 'rightKnee', fe: [0, 10] },
    ],
    { spine: 3, leftShoulder: 3, rightShoulder: 3, leftHip: 3, rightHip: 3, leftKnee: 2, rightKnee: 2 }, FULL,
    'Body forms an inverted V-shape, hands and feet on the ground, hips raised.',
    [
      'Start on hands and knees, wrists under shoulders, knees under hips.',
      'Tuck your toes and lift your knees off the floor.',
      'Push your hips up and back toward the ceiling.',
      'Straighten your legs as much as comfortable.',
      'Press your heels toward the floor.',
    ],
    ['Stretches hamstrings and calves', 'Strengthens arms and shoulders', 'Improves circulation'],
    ['Rounding the upper back excessively', 'Locking the elbows', 'Walking the feet too close to the hands'],
    ['Avoid if you have carpal tunnel syndrome or high blood pressure'],
    30, 10),

  entry('chair', 'Chair Pose', 'Utkatasana', 'Standing', 'beginner',
    [
      { jointId: 'leftHip', fe: [40, 80] }, { jointId: 'rightHip', fe: [40, 80] },
      { jointId: 'leftKnee', fe: [40, 80] }, { jointId: 'rightKnee', fe: [40, 80] },
      { jointId: 'spine', fe: [-5, 15] },
      { jointId: 'leftShoulder', fe: [130, 180] }, { jointId: 'rightShoulder', fe: [130, 180] },
    ],
    { leftHip: 3, rightHip: 3, leftKnee: 3, rightKnee: 3, spine: 2, leftShoulder: 2, rightShoulder: 2 }, SW,
    'Stand as if sitting in an invisible chair, arms raised overhead.',
    [
      'Stand with feet together or hip-width apart.',
      'Inhale and raise both arms overhead.',
      'Exhale and bend your knees, sitting back as if in a chair.',
      'Keep your thighs as parallel to the floor as possible.',
      'Draw your shoulder blades down your back.',
    ],
    ['Strengthens legs and core', 'Stretches shoulders and chest', 'Builds ankle and knee stability'],
    ['Knees extending past the toes', 'Rounding the lower back', 'Dropping the chest forward'],
    ['Avoid if you have knee or ankle injuries'],
    25, 8),
];
