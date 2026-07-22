package dev.slimevr.util

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import kotlin.concurrent.thread

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
            val runNumber = rawName.removePrefix("run_").substringBeforeLast(".")
            val extension = rawName.substringAfterLast(".", "webm")

            val runDir = File("RecordLogs/run_$runNumber")
            if (!runDir.exists()) runDir.mkdirs()

            val bytes = exchange.requestBody.readBytes()
            val outFile = File(runDir, "run_${runNumber}.$extension")
            outFile.writeBytes(bytes)

            println("[VideoUpload] Saved ${bytes.size} bytes to ${outFile.absolutePath}")

            // --- TRIGGER PYTHON SCRIPT ASYNCHRONOUSLY ---
            thread(start = true) {
                try {
                    // FIND THE SCRIPT: Explicitly targeting your structure
                    val possibleScriptLocations = listOf(
                        File("core/src/main/java/dev/slimevr/util/collage.py"), // Exact path from root
                        File("src/main/java/dev/slimevr/util/collage.py"),      // If executed from 'core'
                        File("collage.py")                                      // If executed directly
                    )
                    
                    val pythonScript = possibleScriptLocations.firstOrNull { it.exists() }

                    if (pythonScript == null) {
                        println("[CollageMaker] ERROR: collage.py NOT FOUND!")
                        println("[CollageMaker] Please check your project path.")
                        return@thread
                    }

                    println("[CollageMaker] Found script at ${pythonScript.absolutePath}")
                    println("[CollageMaker] Starting generation for ${outFile.name}...")
                    
                    val process = ProcessBuilder("python3", pythonScript.absolutePath, outFile.absolutePath)
                        .redirectErrorStream(true)
                        .start()

                    process.inputStream.bufferedReader().useLines { lines ->
                        lines.forEach { println("[CollageMaker] $it") }
                    }

                    val exitCode = process.waitFor()
                    if (exitCode == 0) {
                        println("[CollageMaker] Successfully created collage in ${runDir.absolutePath}")
                    } else {
                        println("[CollageMaker] Script failed with exit code $exitCode")
                    }
                } catch (e: Exception) {
                    println("[CollageMaker] Error executing Python script:")
                    e.printStackTrace()
                }
            }

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