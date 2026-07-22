import { PoseDefinition } from '../../../pose/types';
import { BodyPart } from 'solarxr-protocol';

const tadasana: PoseDefinition = {
  name: 'Tadasana',
<<<<<<< HEAD
  description: 'Mountain Pose — stand tall with feet together, arms relaxed at sides',
=======
  description: 'Tadasana (Palm Tree variant) — stand tall with feet together, arms extended straight overhead, palms together',
>>>>>>> feature/applications
  requiredJoints: [
    BodyPart.HEAD,
    BodyPart.NECK,
    BodyPart.CHEST,
    BodyPart.WAIST,
    BodyPart.HIP,
    BodyPart.LEFT_UPPER_ARM,
    BodyPart.LEFT_LOWER_ARM,
    BodyPart.RIGHT_UPPER_ARM,
    BodyPart.RIGHT_LOWER_ARM,
    BodyPart.LEFT_UPPER_LEG,
    BodyPart.LEFT_LOWER_LEG,
    BodyPart.RIGHT_UPPER_LEG,
    BodyPart.RIGHT_LOWER_LEG,
  ],
  referenceRotations: {
    [BodyPart.HEAD]:             { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.NECK]:             { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.CHEST]:            { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.WAIST]:            { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.HIP]:              { x: 0, y: 0, z: 0, w: 1 },
<<<<<<< HEAD
    [BodyPart.LEFT_UPPER_ARM]:   { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.LEFT_LOWER_ARM]:   { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.RIGHT_UPPER_ARM]:  { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.RIGHT_LOWER_ARM]:  { x: 0, y: 0, z: 0, w: 1 },
=======
    // Arms straight overhead. Upper and lower arm share the same absolute
    // rotation on purpose: reference rotations are ABSOLUTE world orientations
    // (compared directly against live sensor rotationG, see PoseScorer), not
    // deltas from a bind pose. Giving the forearm a different value than the
    // upper arm bends the elbow; matching values keeps the arm straight.
    [BodyPart.LEFT_UPPER_ARM]:   { x: 1, y: 0, z: 0, w: 0 },
    [BodyPart.LEFT_LOWER_ARM]:   { x: 1, y: 0, z: 0, w: 0 },
    [BodyPart.RIGHT_UPPER_ARM]:  { x: 1, y: 0, z: 0, w: 0 },
    [BodyPart.RIGHT_LOWER_ARM]:  { x: 1, y: 0, z: 0, w: 0 },
>>>>>>> feature/applications
    [BodyPart.LEFT_UPPER_LEG]:   { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.LEFT_LOWER_LEG]:   { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.RIGHT_UPPER_LEG]:  { x: 0, y: 0, z: 0, w: 1 },
    [BodyPart.RIGHT_LOWER_LEG]:  { x: 0, y: 0, z: 0, w: 1 },
  },
  jointWeights: {
    [BodyPart.HEAD]: 1.2,
    [BodyPart.NECK]: 0.8,
    [BodyPart.CHEST]: 1.5,
    [BodyPart.WAIST]: 1.5,
    [BodyPart.HIP]: 1.0,
    [BodyPart.LEFT_UPPER_ARM]: 0.6,
    [BodyPart.LEFT_LOWER_ARM]: 0.4,
    [BodyPart.RIGHT_UPPER_ARM]: 0.6,
    [BodyPart.RIGHT_LOWER_ARM]: 0.4,
    [BodyPart.LEFT_UPPER_LEG]: 0.6,
    [BodyPart.LEFT_LOWER_LEG]: 0.4,
    [BodyPart.RIGHT_UPPER_LEG]: 0.6,
    [BodyPart.RIGHT_LOWER_LEG]: 0.4,
  },
  jointTolerances: {
    [BodyPart.HEAD]: 0.35,
    [BodyPart.NECK]: 0.30,
    [BodyPart.CHEST]: 0.25,
    [BodyPart.WAIST]: 0.25,
    [BodyPart.HIP]: 0.30,
    [BodyPart.LEFT_UPPER_ARM]: 0.45,
    [BodyPart.LEFT_LOWER_ARM]: 0.45,
    [BodyPart.RIGHT_UPPER_ARM]: 0.45,
    [BodyPart.RIGHT_LOWER_ARM]: 0.45,
    [BodyPart.LEFT_UPPER_LEG]: 0.40,
    [BodyPart.LEFT_LOWER_LEG]: 0.40,
    [BodyPart.RIGHT_UPPER_LEG]: 0.40,
    [BodyPart.RIGHT_LOWER_LEG]: 0.40,
  },
  minimumScore: 0.75,
  holdDuration: 5,
  hints: {
    [BodyPart.HEAD]: 'Keep head upright',
    [BodyPart.NECK]: 'Straighten neck',
    [BodyPart.CHEST]: 'Pull chest upright',
    [BodyPart.WAIST]: 'Engage core',
    [BodyPart.HIP]: 'Level hips',
<<<<<<< HEAD
    [BodyPart.LEFT_UPPER_ARM]: 'Relax left arm',
    [BodyPart.LEFT_LOWER_ARM]: 'Relax left forearm',
    [BodyPart.RIGHT_UPPER_ARM]: 'Relax right arm',
    [BodyPart.RIGHT_LOWER_ARM]: 'Relax right forearm',
=======
    [BodyPart.LEFT_UPPER_ARM]: 'Raise left arm overhead',
    [BodyPart.LEFT_LOWER_ARM]: 'Straighten left arm',
    [BodyPart.RIGHT_UPPER_ARM]: 'Raise right arm overhead',
    [BodyPart.RIGHT_LOWER_ARM]: 'Straighten right arm',
>>>>>>> feature/applications
    [BodyPart.LEFT_UPPER_LEG]: 'Straighten left leg',
    [BodyPart.LEFT_LOWER_LEG]: 'Straighten left knee',
    [BodyPart.RIGHT_UPPER_LEG]: 'Straighten right leg',
    [BodyPart.RIGHT_LOWER_LEG]: 'Straighten right knee',
  },
};

export default tadasana;
