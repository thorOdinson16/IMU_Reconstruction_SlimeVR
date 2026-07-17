package dev.slimevr.util

import dev.slimevr.tracking.trackers.Tracker
import java.io.File
import java.io.PrintWriter

class CsvLogger {
	private var file: PrintWriter? = null
	private val programStartTime = System.currentTimeMillis()
	private var frameCount = 0
	private var needsRewrite = false

	private val lockedLabels = LinkedHashSet<String>()
	private var currentPath: String? = null

	private var lastWriteTime = 0L

	fun makeFilepath(): String {
		var run = 1
		while (true) {
			val path = String.format("RecordLogs/run_%03d/run_%03d.csv", run, run)
			if (!File(path).exists()) return path
			run++
		}
	}

	fun initFile(runNumber: String) {
		val dir = File("RecordLogs/run_$runNumber")
		if (!dir.exists()) dir.mkdirs()
		val path = "RecordLogs/run_${runNumber}/run_${runNumber}.csv"
		currentPath = path
		file = PrintWriter(File(path), "UTF-8")
		println("[CsvLogger] Logging to: $path")
	}

	private fun buildNameToTracker(samples: List<Tracker>): Map<String, Tracker> {
		val map = mutableMapOf<String, Tracker>()
		for (t in samples) map[t.name] = t
		return map
	}

	private fun writeHeader(samples: List<Tracker>) {
		lockedLabels.clear()
		val nameToTracker = buildNameToTracker(samples)

		for (name in SENSOR_ORDER) {
			if (nameToTracker.containsKey(name)) {
				lockedLabels.add(name)
			}
		}

		val sb = StringBuilder("time")
		for (lbl in lockedLabels) {
			sb.append(',').append(lbl).append("_w")
			sb.append(',').append(lbl).append("_x")
			sb.append(',').append(lbl).append("_y")
			sb.append(',').append(lbl).append("_z")
		}
		sb.append(",event\n")
		file?.append(sb.toString())
		file?.flush()
	}

	private fun rewriteWithNewHeader(samples: List<Tracker>) {
		file?.flush()
		file?.close()

		val existingData = StringBuilder()
		val reader = try {
			File(currentPath).readText()
		} catch (e: Exception) { "" }
		if (reader.isNotEmpty()) {
			val newlineIdx = reader.indexOf('\n')
			if (newlineIdx >= 0) {
				existingData.append(reader.substring(newlineIdx + 1))
			}
		}

		file = PrintWriter(File(currentPath), "UTF-8")
		writeHeader(samples)
		if (existingData.isNotEmpty()) {
			file?.append(existingData.toString())
		}
		println("[CsvLogger] Header updated with new sensor")
	}

	fun log(samples: List<Tracker>) {
		val now = System.currentTimeMillis()
		if (lastWriteTime > 0 && now - lastWriteTime < MIN_WRITE_INTERVAL_MS) return

		if (currentPath == null) return

		val elapsed = (now - programStartTime) / 1000.0
		val nameToTracker = buildNameToTracker(samples)

		for (name in SENSOR_ORDER) {
			if (nameToTracker.containsKey(name) && !lockedLabels.contains(name)) {
				needsRewrite = true
				break
			}
		}

		if (lockedLabels.isEmpty() && needsRewrite) {
			needsRewrite = false
			writeHeader(samples)
		} else if (needsRewrite) {
			needsRewrite = false
			rewriteWithNewHeader(samples)
		}

		if (file == null) return

		val sb = StringBuilder()
		sb.append(String.format("%.6f", elapsed))

		for (lbl in lockedLabels) {
			val tracker = nameToTracker[lbl]
			if (tracker != null) {
				val q = tracker.getRawRotation()
				sb.append(',').append(String.format("%.6f", q.w))
				sb.append(',').append(String.format("%.6f", q.x))
				sb.append(',').append(String.format("%.6f", q.y))
				sb.append(',').append(String.format("%.6f", q.z))
			} else {
				sb.append(",,,,")
			}
		}
		sb.append(",\n")

		file?.append(sb.toString())
		lastWriteTime = now

		if (++frameCount % FLUSH_EVERY_N == 0) file?.flush()
	}

	fun markEvent(label: String) {
		val f = file ?: return
		val elapsed = (System.currentTimeMillis() - programStartTime) / 1000.0
		val sb = StringBuilder()
		sb.append(String.format("%.6f", elapsed))
		for (i in lockedLabels.indices) sb.append(",,,,")
		sb.append(',').append(label).append('\n')
		f.append(sb.toString())
		f.flush()
	}

	fun close() {
		file?.let {
			it.flush()
			it.close()
			println("[CsvLogger] File closed.")
		}
		file = null
		lockedLabels.clear()
		needsRewrite = false
		currentPath = null
		frameCount = 0
		lastWriteTime = 0
	}

	companion object {
		private const val FLUSH_EVERY_N = 60
		private const val MIN_WRITE_INTERVAL_MS = 20L

		val SENSOR_ORDER = listOf(
			"CHEST", "L_FA", "L_UA", "R_FA", "R_UA",
			"HIPS", "L_TH", "L_SH", "R_TH", "R_SH"
		)
	}
}
