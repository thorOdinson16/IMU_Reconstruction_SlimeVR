package dev.slimevr.util

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress

class VideoUploadServer(port: Int = 21111) {
	private val server: HttpServer = HttpServer.create(InetSocketAddress(port), 0)

	private fun addCorsHeaders(exchange: HttpExchange) {
		exchange.responseHeaders.add("Access-Control-Allow-Origin", "*")
		exchange.responseHeaders.add("Access-Control-Allow-Methods", "POST, OPTIONS")
		exchange.responseHeaders.add("Access-Control-Allow-Headers", "X-Filename, Content-Type")
	}

	init {
		server.createContext("/upload") { exchange: HttpExchange ->
			addCorsHeaders(exchange)

			if (exchange.requestMethod == "OPTIONS") {
				exchange.sendResponseHeaders(204, -1)
				return@createContext
			}

			if (exchange.requestMethod != "POST") {
				exchange.sendResponseHeaders(405, -1)
				return@createContext
			}

			val rawName = exchange.requestHeaders.getFirst("X-Filename") ?: "recording.webm"
			val runNumber = rawName.removePrefix("run_").removeSuffix(".webm")

			val runDir = File("RecordLogs/run_$runNumber")
			if (!runDir.exists()) runDir.mkdirs()

			val bytes = exchange.requestBody.readBytes()
			val outFile = File(runDir, "run_${runNumber}.webm")
			outFile.writeBytes(bytes)

			println("[VideoUpload] Saved ${bytes.size} bytes to ${outFile.absolutePath}")

			exchange.sendResponseHeaders(200, 0)
			exchange.responseBody.write("OK".toByteArray())
			exchange.responseBody.close()
		}
	}

	fun start() {
		server.executor = java.util.concurrent.Executors.newSingleThreadExecutor()
		server.start()
		println("[VideoUploadServer] Started on port ${server.address.port}")
	}

	fun getPort(): Int = server.address.port
}
