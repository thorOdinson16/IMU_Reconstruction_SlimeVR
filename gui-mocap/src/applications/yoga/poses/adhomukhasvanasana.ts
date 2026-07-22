import { PoseDefinition } from '../../../pose/types';
import { BodyPart } from 'solarxr-protocol';

const adhoMukhaSvanasana: PoseDefinition = {
  name: 'Adho Mukha Svanasana',
  description: 'Downward Facing Dog — hips lifted high, arms and legs straight, forming an inverted V, head down between the arms',
  requiredJoints: [
    BodyPart.HEAD, BodyPart.NECK, BodyPart.CHEST, BodyPart.WAIST, BodyPart.HIP,
    BodyPart.LEFT_UPPER_ARM, BodyPart.LEFT_LOWER_ARM,
    BodyPart.RIGHT_UPPER_ARM, BodyPart.RIGHT_LOWER_ARM,
    BodyPart.LEFT_UPPER_LEG, BodyPart.LEFT_LOWER_LEG, BodyPart.LEFT_FOOT,
    BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG, BodyPart.RIGHT_FOOT,
  ],
  referenceRotations: {
    [BodyPart.HEAD]:             { x: 0.500, y: 0, z: 0, w: 0.866 },
    [BodyPart.NECK]:             { x: 0.259, y: 0, z: 0, w: 0.966 },
    [BodyPart.CHEST]:            { x: 0.707, y: 0, z: 0, w: 0.707 },
    [BodyPart.WAIST]:            { x: 0.707, y: 0, z: 0, w: 0.707 },
    [BodyPart.HIP]:              { x: 0.500, y: 0, z: 0, w: 0.866 },
    [BodyPart.LEFT_UPPER_ARM]:   { x: -0.612, y: 0.354, z: -0.354, w: 0.612 },
    [BodyPart.LEFT_LOWER_ARM]:   { x: -0.612, y: 0.354, z: -0.354, w: 0.612 },
    [BodyPart.RIGHT_UPPER_ARM]:  { x: -0.612, y: -0.354, z: 0.354, w: 0.612 },
    [BodyPart.RIGHT_LOWER_ARM]:  { x: -0.612, y: -0.354, z: 0.354, w: 0.612 },
    [BodyPart.LEFT_UPPER_LEG]:   { x: 0.354, y: 0, z: 0, w: 0.935 },
    [BodyPart.LEFT_LOWER_LEG]:   { x: 0.354, y: 0, z: 0, w: 0.935 },
    [BodyPart.LEFT_FOOT]:        { x: 0.259, y: 0, z: 0, w: 0.966 },
    [BodyPart.RIGHT_UPPER_LEG]:  { x: 0.354, y: 0, z: 0, w: 0.935 },
    [BodyPart.RIGHT_LOWER_LEG]:  { x: 0.354, y: 0, z: 0, w: 0.935 },
    [BodyPart.RIGHT_FOOT]:       { x: 0.259, y: 0, z: 0, w: 0.966 },
  },
  jointWeights: {
    [BodyPart.HEAD]: 0.8, [BodyPart.NECK]: 0.6, [BodyPart.CHEST]: 1.5, [BodyPart.WAIST]: 1.5,
    [BodyPart.HIP]: 1.3, [BodyPart.LEFT_UPPER_ARM]: 1.0, [BodyPart.LEFT_LOWER_ARM]: 0.8,
    [BodyPart.RIGHT_UPPER_ARM]: 1.0, [BodyPart.RIGHT_LOWER_ARM]: 0.8, [BodyPart.LEFT_UPPER_LEG]: 1.0,
    [BodyPart.LEFT_LOWER_LEG]: 0.8, [BodyPart.LEFT_FOOT]: 0.4, [BodyPart.RIGHT_UPPER_LEG]: 1.0,
    [BodyPart.RIGHT_LOWER_LEG]: 0.8, [BodyPart.RIGHT_FOOT]: 0.4,
  },
  jointTolerances: {
    [BodyPart.HEAD]: 0.40, [BodyPart.NECK]: 0.35, [BodyPart.CHEST]: 0.30, [BodyPart.WAIST]: 0.30,
    [BodyPart.HIP]: 0.35, [BodyPart.LEFT_UPPER_ARM]: 0.45, [BodyPart.LEFT_LOWER_ARM]: 0.35,
    [BodyPart.RIGHT_UPPER_ARM]: 0.45, [BodyPart.RIGHT_LOWER_ARM]: 0.35, [BodyPart.LEFT_UPPER_LEG]: 0.40,
    [BodyPart.LEFT_LOWER_LEG]: 0.35, [BodyPart.LEFT_FOOT]: 0.45, [BodyPart.RIGHT_UPPER_LEG]: 0.40,
    [BodyPart.RIGHT_LOWER_LEG]: 0.35, [BodyPart.RIGHT_FOOT]: 0.45,
  },
  minimumScore: 0.70,
  holdDuration: 5,
  hints: {
    [BodyPart.HEAD]: 'Relax head down', [BodyPart.NECK]: 'Let neck follow spine',
    [BodyPart.CHEST]: 'Push chest toward thighs', [BodyPart.WAIST]: 'Lift hips higher',
    [BodyPart.HIP]: 'Form an inverted V at the hips', [BodyPart.LEFT_UPPER_ARM]: 'Extend left arm forward',
    [BodyPart.LEFT_LOWER_ARM]: 'Straighten left arm', [BodyPart.RIGHT_UPPER_ARM]: 'Extend right arm forward',
    [BodyPart.RIGHT_LOWER_ARM]: 'Straighten right arm', [BodyPart.LEFT_UPPER_LEG]: 'Straighten left leg',
    [BodyPart.LEFT_LOWER_LEG]: 'Straighten left knee', [BodyPart.LEFT_FOOT]: 'Press left heel down',
    [BodyPart.RIGHT_UPPER_LEG]: 'Straighten right leg', [BodyPart.RIGHT_LOWER_LEG]: 'Straighten right knee',
    [BodyPart.RIGHT_FOOT]: 'Press right heel down',
  },
};

export default adhoMukhaSvanasana;
