package dev.slimevr.unit

import com.jme3.math.FastMath
import dev.slimevr.tracking.processor.HumanPoseManager
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Test
import kotlin.test.assertTrue

class LegRotationContinuityTests {

	@Test
	fun thighRotationRemainsContinuousDuringFullYawTurn() {
		val trackers = TestTrackerSet()
		val hpm = HumanPoseManager(trackers.allL)

		var previousLeft: Quaternion? = null
		var previousRight: Quaternion? = null

		for (yawDeg in 0..360 step 5) {
			val yawRad = yawDeg * FastMath.DEG_TO_RAD
			val rot = Quaternion.rotationAroundYAxis(yawRad)

			trackers.head.setRotation(rot)
			trackers.chest.setRotation(rot)
			trackers.hip.setRotation(rot)
			trackers.leftThigh.setRotation(rot)
			trackers.rightThigh.setRotation(rot)
			trackers.leftCalf.setRotation(rot)
			trackers.rightCalf.setRotation(rot)

			hpm.update()

			val left = hpm.skeleton.leftUpperLegBone.getGlobalRotation()
			val right = hpm.skeleton.rightUpperLegBone.getGlobalRotation()
			previousLeft?.let {
				assertTrue(
					it.angleToR(left) < 0.6f,
					"Left thigh jumped by ${it.angleToR(left) * FastMath.RAD_TO_DEG}° at yaw=$yawDeg°",
				)
			}
			previousRight?.let {
				assertTrue(
					it.angleToR(right) < 0.6f,
					"Right thigh jumped by ${it.angleToR(right) * FastMath.RAD_TO_DEG}° at yaw=$yawDeg°",
				)
			}
			previousLeft = left
			previousRight = right
		}

		@Test
		fun thighRotationRemainsContinuousWithMountingAndResetPipeline() {
			val trackers = TestTrackerSet()
			val hpm = HumanPoseManager(trackers.allL)

			(trackers.allL).forEach { tracker ->
				val pos = tracker.trackerPosition
				if (pos != null) tracker.resetsHandler.mountingOrientation = pos.defaultMounting()
			}

			trackers.head.setRotation(Quaternion.IDENTITY)
			hpm.resetTrackersFull("test")

			var previousLeft: Quaternion? = null
			var previousRight: Quaternion? = null

			for (yawDeg in 0..360 step 5) {
				val rot = Quaternion.rotationAroundYAxis(yawDeg * FastMath.DEG_TO_RAD)

				trackers.head.setRotation(rot)
				trackers.chest.setRotation(rot)
				trackers.hip.setRotation(rot)
				trackers.leftThigh.setRotation(rot)
				trackers.rightThigh.setRotation(rot)
				trackers.leftCalf.setRotation(rot)
				trackers.rightCalf.setRotation(rot)

				hpm.update()

				val left = hpm.skeleton.leftUpperLegBone.getGlobalRotation()
				val right = hpm.skeleton.rightUpperLegBone.getGlobalRotation()
				previousLeft?.let {
					assertTrue(
						it.angleToR(left) < 0.8f,
						"Left thigh jumped by ${it.angleToR(left) * FastMath.RAD_TO_DEG}° at yaw=$yawDeg°",
					)
				}
				previousRight?.let {
					assertTrue(
						it.angleToR(right) < 0.8f,
						"Right thigh jumped by ${it.angleToR(right) * FastMath.RAD_TO_DEG}° at yaw=$yawDeg°",
					)
				}
				previousLeft = left
				previousRight = right
			}
		}
	}
}
