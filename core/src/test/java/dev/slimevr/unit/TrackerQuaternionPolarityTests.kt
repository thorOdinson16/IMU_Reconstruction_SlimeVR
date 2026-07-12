package dev.slimevr.unit

import dev.slimevr.tracking.trackers.Tracker
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Test
import kotlin.test.assertTrue

class TrackerQuaternionPolarityTests {

	@Test
	fun setRotationKeepsQuaternionPolarityContinuous() {
		val tracker = Tracker(
			device = null,
			id = 1,
			name = "test",
			trackerPosition = null,
			hasRotation = true,
			trackRotDirection = false,
		)

		val q = Quaternion.rotationAroundYAxis(1.2f)
		tracker.setRotation(q)
		val first = tracker.getRawRotation()

		// Same physical orientation with opposite quaternion sign.
		tracker.setRotation(-q)
		val second = tracker.getRawRotation()

		assertTrue(
			first.dot(second) > 0f,
			"Quaternion polarity should stay continuous for equivalent q/-q samples.",
		)
	}
}
