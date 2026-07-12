package dev.slimevr.unit

import com.jme3.math.FastMath
import dev.slimevr.tracking.processor.HumanPoseManager
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Test
import kotlin.test.assertTrue

class HipRotationContinuityTests {

	@Test
	fun hipRotationRemainsContinuousAcrossLegQuaternionSignFlips() {
		val trackers = TestTrackerSet()
		val hpm = HumanPoseManager(trackers.allL)

		// Simulate a setup without a hip tracker so hip yaw is inferred from chest + legs.
		hpm.skeleton.hipTracker = null

		var previousHipRotation: Quaternion? = null

		for (yawDeg in 0..360 step 5) {
			val yawRad = yawDeg * FastMath.DEG_TO_RAD
			val bodyRotation = Quaternion.rotationAroundYAxis(yawRad)
			val legRotation = if (yawDeg in 90 until 270) -bodyRotation else bodyRotation

			trackers.head.setRotation(bodyRotation)
			trackers.chest.setRotation(bodyRotation)
			trackers.leftThigh.setRotation(legRotation)
			trackers.rightThigh.setRotation(legRotation)
			trackers.leftCalf.setRotation(legRotation)
			trackers.rightCalf.setRotation(legRotation)

			hpm.update()

			val currentHipRotation = hpm.skeleton.hipBone.getGlobalRotation()
			previousHipRotation?.let { previous ->
				val delta = previous.angleToR(currentHipRotation)
				assertTrue(
					delta < 0.6f,
					"Hip rotation jumped by ${delta * FastMath.RAD_TO_DEG}° at yaw=$yawDeg°.",
				)
			}
			previousHipRotation = currentHipRotation
		}
	}
}
