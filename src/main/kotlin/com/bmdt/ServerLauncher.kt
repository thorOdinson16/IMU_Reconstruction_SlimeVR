package com.bmdt

import dev.slimevr.VRServer
import dev.slimevr.config.ConfigManager
import dev.slimevr.util.VideoUploadServer
import java.io.File

fun main() {
    println("[ServerLauncher] Starting SlimeVR server...")

    val configFile = File("config.json")
    if (!configFile.exists()) {
        println("[ServerLauncher] Config file not found at ${configFile.absolutePath} – exiting.")
        return
    }

    val configManager = ConfigManager(configFile.absolutePath)
    configManager.loadConfig()

    if (configManager.vrConfig == null) {
        println("[ServerLauncher] Config file did not load properly; creating default config via reflection.")
        val vrConfig = dev.slimevr.config.VRConfig()
        val field = ConfigManager::class.java.getDeclaredField("vrConfig")
        field.isAccessible = true
        field.set(configManager, vrConfig)
    }

    val server = VRServer(configManager = configManager)

    val videoServer = VideoUploadServer()
    videoServer.start()

    server.start()

    println("[ServerLauncher] SlimeVR server started. Press Ctrl+C to stop.")
    println("[ServerLauncher] Video upload server started on port ${videoServer.getPort()}")

    try {
        server.join()
    } catch (e: InterruptedException) {
        println("[ServerLauncher] Server stopped.")
    }
}