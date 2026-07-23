import type { JointId } from '../../analysis';

export type MovementAxis = 'flexionExtension' | 'abductionAdduction' | 'internalExternalRotation';
export type ExerciseSide = 'left' | 'right' | 'bilateral';

export interface ExerciseDef {
  id: string;
  name: string;
  category: string;
  joint: JointId;
  movementAxis: MovementAxis;
  expectedRomMin: number;
  expectedRomMax: number;
  engageThresholdDeg: number;
  returnThresholdDeg: number;
  holdDurationSec: number;
  instructions: string[];
  sides: ExerciseSide[];
  contraindications: string[];
}

const EXERCISES: ExerciseDef[] = [
  {
    id: 'shoulder-flexion-l',
    name: 'Shoulder Flexion',
    category: 'Shoulder',
    joint: 'leftShoulder',
    movementAxis: 'flexionExtension',
    expectedRomMin: 0,
    expectedRomMax: 170,
    engageThresholdDeg: 30,
    returnThresholdDeg: 15,
    holdDurationSec: 0,
    instructions: [
      'Stand or sit upright with your arm at your side.',
      'Keep your elbow straight throughout the movement.',
      'Raise your arm forward and upward as far as comfortable.',
      'Lower your arm back to the starting position slowly.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid if you have acute shoulder pain', 'Do not force beyond comfortable range'],
  },
  {
    id: 'shoulder-abduction-l',
    name: 'Shoulder Abduction',
    category: 'Shoulder',
    joint: 'leftShoulder',
    movementAxis: 'abductionAdduction',
    expectedRomMin: 0,
    expectedRomMax: 170,
    engageThresholdDeg: 30,
    returnThresholdDeg: 15,
    holdDurationSec: 0,
    instructions: [
      'Stand upright with your arm at your side, palm facing forward.',
      'Keep your elbow straight.',
      'Raise your arm out to the side and upward as far as comfortable.',
      'Lower slowly back to the starting position.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid if you have shoulder impingement', 'Stop if you feel pinching at the top of the shoulder'],
  },
  {
    id: 'shoulder-ext-rotation-l',
    name: 'Shoulder External Rotation',
    category: 'Shoulder',
    joint: 'leftShoulder',
    movementAxis: 'internalExternalRotation',
    expectedRomMin: -80,
    expectedRomMax: -20,
    engageThresholdDeg: -40,
    returnThresholdDeg: -20,
    holdDurationSec: 0,
    instructions: [
      'Lie on your back or stand with elbow bent at 90° and tucked at your side.',
      'Keep your elbow against your body throughout.',
      'Rotate your forearm outward as far as comfortable.',
      'Return to the starting position slowly.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid if you have shoulder instability', 'Keep your elbow tucked at your side'],
  },
  {
    id: 'elbow-flexion-l',
    name: 'Elbow Flexion',
    category: 'Elbow',
    joint: 'leftElbow',
    movementAxis: 'flexionExtension',
    expectedRomMin: 0,
    expectedRomMax: 145,
    engageThresholdDeg: 30,
    returnThresholdDeg: 15,
    holdDurationSec: 0,
    instructions: [
      'Stand or sit with your arm at your side.',
      'Bend your elbow, bringing your hand toward your shoulder.',
      'Straighten your elbow fully.',
    ],
    sides: ['left', 'right'],
    contraindications: [],
  },
  {
    id: 'elbow-extension-l',
    name: 'Elbow Extension',
    category: 'Elbow',
    joint: 'leftElbow',
    movementAxis: 'flexionExtension',
    expectedRomMin: 0,
    expectedRomMax: -10,
    engageThresholdDeg: 120,
    returnThresholdDeg: 10,
    holdDurationSec: 3,
    instructions: [
      'Start with your elbow bent.',
      'Straighten your elbow as fully as possible.',
      'Hold at full extension.',
      'Return to the starting position.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid hyperextending the elbow'],
  },
  {
    id: 'hip-flexion-l',
    name: 'Hip Flexion',
    category: 'Hip',
    joint: 'leftHip',
    movementAxis: 'flexionExtension',
    expectedRomMin: 0,
    expectedRomMax: 120,
    engageThresholdDeg: 20,
    returnThresholdDeg: 10,
    holdDurationSec: 0,
    instructions: [
      'Stand upright or lie on your back.',
      'Keep your knee bent slightly or straight as comfortable.',
      'Raise your leg forward as far as comfortable.',
      'Lower your leg back to the starting position.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid if you have hip replacement with movement restrictions'],
  },
  {
    id: 'hip-abduction-l',
    name: 'Hip Abduction',
    category: 'Hip',
    joint: 'leftHip',
    movementAxis: 'abductionAdduction',
    expectedRomMin: 0,
    expectedRomMax: 45,
    engageThresholdDeg: 10,
    returnThresholdDeg: 5,
    holdDurationSec: 0,
    instructions: [
      'Stand upright holding onto a stable surface for support.',
      'Keep your knee straight and your toes pointing forward.',
      'Lift your leg out to the side as far as comfortable.',
      'Lower your leg back to the starting position slowly.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Use support to maintain balance'],
  },
  {
    id: 'knee-flexion-l',
    name: 'Knee Flexion',
    category: 'Knee',
    joint: 'leftKnee',
    movementAxis: 'flexionExtension',
    expectedRomMin: 0,
    expectedRomMax: 140,
    engageThresholdDeg: 30,
    returnThresholdDeg: 15,
    holdDurationSec: 0,
    instructions: [
      'Lie on your stomach or sit on a chair.',
      'Bend your knee, bringing your heel toward your buttock.',
      'Straighten your knee fully.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid if you have acute knee pain', 'Do not force the bend'],
  },
  {
    id: 'ankle-dorsiflexion-l',
    name: 'Ankle Dorsiflexion',
    category: 'Ankle',
    joint: 'leftAnkle',
    movementAxis: 'flexionExtension',
    expectedRomMin: 0,
    expectedRomMax: 20,
    engageThresholdDeg: 5,
    returnThresholdDeg: 3,
    holdDurationSec: 0,
    instructions: [
      'Sit on a chair with your foot flat on the floor.',
      'Lift your toes upward while keeping your heel on the floor.',
      'Return your foot to the starting position.',
    ],
    sides: ['left', 'right'],
    contraindications: [],
  },
  {
    id: 'neck-rotation',
    name: 'Neck Rotation',
    category: 'Neck',
    joint: 'neck',
    movementAxis: 'internalExternalRotation',
    expectedRomMin: -70,
    expectedRomMax: 70,
    engageThresholdDeg: 20,
    returnThresholdDeg: 10,
    holdDurationSec: 0,
    instructions: [
      'Sit or stand upright with your head facing forward.',
      'Slowly turn your head to one side as far as comfortable.',
      'Return to the center.',
      'Repeat on the other side.',
    ],
    sides: ['bilateral'],
    contraindications: ['Avoid if you have cervical spine instability', 'Move slowly and stop if you feel dizzy'],
  },
  {
    id: 'knee-extension-sitting-l',
    name: 'Knee Extension (Sitting)',
    category: 'Knee',
    joint: 'leftKnee',
    movementAxis: 'flexionExtension',
    expectedRomMin: -10,
    expectedRomMax: 0,
    engageThresholdDeg: -5,
    returnThresholdDeg: -3,
    holdDurationSec: 5,
    instructions: [
      'Sit on a chair with your knee bent.',
      'Straighten your knee as fully as possible.',
      'Hold the straight position.',
      'Lower your leg slowly.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid hyperextension'],
  },
  {
    id: 'shoulder-scaption-l',
    name: 'Scaption (Scapular Plane Elevation)',
    category: 'Shoulder',
    joint: 'leftShoulder',
    movementAxis: 'flexionExtension',
    expectedRomMin: 0,
    expectedRomMax: 150,
    engageThresholdDeg: 30,
    returnThresholdDeg: 15,
    holdDurationSec: 0,
    instructions: [
      'Stand with your arms at your sides, thumbs pointing forward.',
      'Raise your arms at a 30-45° angle from the front (between flexion and abduction).',
      'Lift as high as comfortable.',
      'Lower slowly.',
    ],
    sides: ['left', 'right'],
    contraindications: ['Avoid if you have shoulder impingement'],
  },
];

export function getExercises(): ExerciseDef[] {
  return EXERCISES;
}

export function getExercise(id: string): ExerciseDef | undefined {
  return EXERCISES.find((e) => e.id === id);
}

export function getExercisesByCategory(): Map<string, ExerciseDef[]> {
  const map = new Map<string, ExerciseDef[]>();
  for (const ex of EXERCISES) {
    const list = map.get(ex.category);
    if (list) list.push(ex);
    else map.set(ex.category, [ex]);
  }
  return map;
}
