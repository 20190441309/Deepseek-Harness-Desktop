package ai.deepseek.harness.mobile.host

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

data class HandshakeResult(
    val host: JsonElement,
    val sessions: JsonElement,
    val workspaces: JsonElement,
)

object Handshake {
    suspend fun run(
        call: suspend (method: String, payload: JsonObject) -> UnaryResult,
        connectEvents: suspend () -> Unit,
    ): HandshakeResult {
        val host = call("host.describe", buildJsonObject {})
        if (!host.ok) throw IllegalStateException(host.error ?: "host.describe failed")
        val (sessions, workspaces) = coroutineScope {
            val sessionsDeferred = async { call("session.list", buildJsonObject {}) }
            val workspacesDeferred = async { call("workspace.list", buildJsonObject {}) }
            sessionsDeferred.await() to workspacesDeferred.await()
        }
        if (!sessions.ok) throw IllegalStateException(sessions.error ?: "session.list failed")
        if (!workspaces.ok) throw IllegalStateException(workspaces.error ?: "workspace.list failed")
        connectEvents()
        return HandshakeResult(
            host = host.value ?: buildJsonObject {},
            sessions = sessions.value ?: buildJsonObject {},
            workspaces = workspaces.value ?: buildJsonObject {},
        )
    }
}
