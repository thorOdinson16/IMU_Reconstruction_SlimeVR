import type { Quat, Vec3 } from './model';

export const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export function vec(x = 0, y = 0, z = 0): Vec3 { return { x, y, z }; }
export function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
export function subtract(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function scale(a: Vec3, factor: number): Vec3 { return { x: a.x * factor, y: a.y * factor, z: a.z * factor }; }
export function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
export function magnitude(a: Vec3): number { return Math.hypot(a.x, a.y, a.z); }
export function normalize(a: Vec3): Vec3 { const length = magnitude(a); return length > 1e-8 ? scale(a, 1 / length) : ZERO; }
export function projectOntoPlane(a: Vec3, normal: Vec3): Vec3 { return subtract(a, scale(normal, dot(a, normal))); }
export function isFiniteVec(a: Vec3): boolean { return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z); }
export function radiansToDegrees(value: number): number { return value * 180 / Math.PI; }
export function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

export function normalizeQuat(q: Quat): Quat | null {
  if (![q.x, q.y, q.z, q.w].every(Number.isFinite)) return null;
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  return length > 1e-8 ? { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length } : null;
}
export function inverseQuat(q: Quat): Quat { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }
export function multiplyQuat(a: Quat, b: Quat): Quat {
  return { w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w };
}
export function rotate(q: Quat, value: Vec3): Vec3 {
  const v: Quat = { x: value.x, y: value.y, z: value.z, w: 0 };
  const result = multiplyQuat(multiplyQuat(q, v), inverseQuat(q));
  return { x: result.x, y: result.y, z: result.z };
}
export function angularDistanceDeg(a: Quat, b: Quat): number {
  const delta = multiplyQuat(inverseQuat(a), b);
  return radiansToDegrees(2 * Math.acos(clamp(Math.abs(delta.w), -1, 1)));
}

/** XYZ intrinsic Euler convention: X flexion/extension, Z ab/adduction, Y axial rotation. */
export function quaternionToAnatomicalEuler(q: Quat): { flexionExtension: number; abductionAdduction: number; internalExternalRotation: number } {
  const sinX = 2 * (q.w * q.x - q.y * q.z);
  const cosX = 1 - 2 * (q.x * q.x + q.y * q.y);
  const sinY = 2 * (q.w * q.y + q.z * q.x);
  const sinZ = 2 * (q.w * q.z - q.x * q.y);
  const cosZ = 1 - 2 * (q.y * q.y + q.z * q.z);
  return { flexionExtension: radiansToDegrees(Math.atan2(sinX, cosX)), abductionAdduction: radiansToDegrees(Math.atan2(sinZ, cosZ)), internalExternalRotation: radiansToDegrees(Math.asin(clamp(sinY, -1, 1))) };
}
export function quaternionToEuler(q: Quat): { roll: number; pitch: number; yaw: number } {
  const roll = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
  const pitch = Math.asin(clamp(2 * (q.w * q.y - q.z * q.x), -1, 1));
  const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
  return { roll: radiansToDegrees(roll), pitch: radiansToDegrees(pitch), yaw: radiansToDegrees(yaw) };
}
