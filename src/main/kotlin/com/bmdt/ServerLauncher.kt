package com.bmdt

import dev.slimevr.VRServer
import dev.slimevr.config.ConfigManager
import java.io.File

fun main() {
    println("[ServerLauncher] Starting SlimeVR server...")

    // Path to the existing config file (project root)
    val configFile = File("config.json")
    if (!configFile.exists()) {
        println("[ServerLauncher] Config file not found at ${configFile.absolutePath} – exiting.")
        return
    }

    // Load configuration – ConfigManager expects a file path string
    val configManager = ConfigManager(configFile.absolutePath)
    configManager.loadConfig()

    // If vrConfig is still null (e.g., config is empty), fall back to default
    if (configManager.vrConfig == null) {
        println("[ServerLauncher] Config file did not load properly; creating default config via reflection.")
        val vrConfig = dev.slimevr.config.VRConfig() // default values
        val field = ConfigManager::class.java.getDeclaredField("vrConfig")
        field.isAccessible = true
        field.set(configManager, vrConfig)
    }

    // Create the full server (UDP + WebSocket)
    val server = VRServer(configManager = configManager)

    // Start the server thread
    server.start()

    println("[ServerLauncher] SlimeVR server started. Press Ctrl+C to stop.")

    try {
        server.join()
    } catch (e: InterruptedException) {
        println("[ServerLauncher] Server stopped.")
    }
}