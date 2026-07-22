package dev.slimevr.tracking.processor.skeleton

import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3

/**
 * Bottom-up bone-vector pelvis position estimator, adapted from:
 *   Patil et al., "Fusion of Multiple Lidars and Inertial Sensors for
 *   the Real-Time Pose Tracking of Human Motion", Sensors 2020, 20, 5342,
 *   Section 3.3.1, Algorithm 1.
 *
 * IMU-only: no lidar drift correction. Meant to be called only when a
 * foot is LOCKED (planted), using that foot's last corrected position
 * as the fixed anchor -- the same role the lidar point cloud played in
 * the original paper. Without lidar, translation still drifts between
 * plants; this only removes drift accumulated *during* a plant.
 */
class PelvisEstimator {

	/**
	 * @param footPosition   fixed world position of the planted foot
	 * @param ankleRot       global rotation of the lower-leg (ankle) bone
	 * @param kneeRot        global rotation of the upper-leg (knee) bone
	 * @param hipRot         global rotation of the hip-side bone (leftHip/rightHip)
	 * @param lowerLegLength lower-leg bone length, meters
	 * @param upperLegLength upper-leg bone length, meters
	 * @param hipLength      hip bone length (hip joint to pelvis center), meters
	 */
	data class LegChainInput(
		val footPosition: Vector3,
		val ankleRot: Quaternion,
		val kneeRot: Quaternion,
		val hipRot: Quaternion,
		val lowerLegLength: Float,
		val upperLegLength: Float,
		val hipLength: Float,
	)

	/**
	 * Algorithm 1 step (b)-(c): rotate the bone's local rest axis by its
	 * world rotation and propagate by bone length. Local rest axis is
	 * +Y in this codebase's convention (see Bone.updateLength: tail
	 * translation is (0, -length, 0)).
	 */
	private fun propagate(from: Vector3, rotation: Quaternion, boneLength: Float): Vector3 {
		val localAxis = Vector3(0f, 1f, 0f)
		val worldDir = rotation.sandwich(localAxis)
		return from + worldDir * boneLength
	}

	/** Bottom-up chain for one leg: foot (fixed) -> knee -> hip -> pelvis. */
	private fun estimatePelvisFromLeg(leg: LegChainInput): Vector3 {
		val kneePos = propagate(leg.footPosition, leg.ankleRot, leg.lowerLegLength)
		val hipJointPos = propagate(kneePos, leg.kneeRot, leg.upperLegLength)
		return propagate(hipJointPos, leg.hipRot, leg.hipLength)
	}

	/**
	 * Estimates pelvis position from whichever leg(s) are planted.
	 * Both planted (double support) -> average, matching the paper's
	 * intent of using the Rh/Lh check to pick a reliable side, extended
	 * here to blend when both sides are equally reliable.
	 */
	fun estimatePelvisPosition(
		leftLeg: LegChainInput?,
		rightLeg: LegChainInput?,
	): Vector3? {
		val leftEstimate = leftLeg?.let { estimatePelvisFromLeg(it) }
		val rightEstimate = rightLeg?.let { estimatePelvisFromLeg(it) }

		return when {
			leftEstimate != null && rightEstimate != null -> (leftEstimate + rightEstimate) * 0.5f
			leftEstimate != null -> leftEstimate
			rightEstimate != null -> rightEstimate
			else -> null
		}
	}
}