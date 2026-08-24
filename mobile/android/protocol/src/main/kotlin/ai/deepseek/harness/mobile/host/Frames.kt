package ai.deepseek.harness.mobile.host

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class SessionRow(
    val sessionId: String,
    val blank: Boolean = false,
    val running: Boolean = false,
    val cwd: String? = null,
    val origin: String? = null,
    val title: String? = null,
    val updatedAt: Long? = null,
)

object Frames {
    fun hostLabel(host: JsonObject?): String {
        val cwd = host?.get("cwd")?.jsonPrimitive?.contentOrNull?.trim()?.trimEnd('/', '\\').orEmpty()
        if (cwd.isEmpty()) return "已连接"
        return cwd.split('/', '\\').lastOrNull { it.isNotEmpty() } ?: cwd
    }

    fun applyHostFrame(sessions: List<SessionRow>, payload: JsonObject?): List<SessionRow> {
        if (payload == null) return sessions
        return when (payload["type"]?.jsonPrimitive?.contentOrNull) {
            "host/session-added" -> {
                val sessionId = payload["sessionId"]?.jsonPrimitive?.contentOrNull ?: return sessions
                if (sessions.any { it.sessionId == sessionId }) sessions
                else listOf(
                    SessionRow(
                        sessionId = sessionId,
                        blank = jsonFlag(payload["blank"]),
                        cwd = payload["cwd"]?.jsonPrimitive?.contentOrNull,
                        origin = payload["origin"]?.jsonPrimitive?.contentOrNull,
                    ),
                ) + sessions
            }
            "host/session-removed" -> sessions.filter {
                it.sessionId != payload["sessionId"]?.jsonPrimitive?.contentOrNull
            }
            "host/session-status" -> sessions.map { row ->
                if (row.sessionId == payload["sessionId"]?.jsonPrimitive?.contentOrNull) {
                    row.copy(running = jsonFlag(payload["running"]))
                } else row
            }
            else -> sessions
        }
    }

    fun sessionsFromList(value: JsonElementLike): List<SessionRow> {
        val obj = value as? JsonObject ?: return emptyList()
        val items = obj["items"]?.jsonArray ?: return emptyList()
        return items.mapNotNull { item ->
            val row = item.jsonObject
            val id = row["sessionId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            SessionRow(
                sessionId = id,
                blank = jsonFlag(row["blank"]),
                running = jsonFlag(row["running"]),
                cwd = row["cwd"]?.jsonPrimitive?.contentOrNull,
                origin = row["origin"]?.jsonPrimitive?.contentOrNull,
                title = row["projections"]?.jsonObject?.get("values")?.jsonObject
                    ?.get("title")?.jsonPrimitive?.contentOrNull,
                updatedAt = row["updatedAt"]?.jsonPrimitive?.contentOrNull?.toLongOrNull(),
            )
        }
    }
}

typealias JsonElementLike = kotlinx.serialization.json.JsonElement

private fun jsonFlag(value: kotlinx.serialization.json.JsonElement?): Boolean {
    val primitive = value as? JsonPrimitive ?: return false
    return primitive.booleanOrNull == true || primitive.contentOrNull == "true"
}

fun emptyPayload(): JsonObject = buildJsonObject { put("ok", true) }
