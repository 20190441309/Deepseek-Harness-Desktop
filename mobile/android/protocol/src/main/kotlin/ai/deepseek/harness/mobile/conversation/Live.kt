package ai.deepseek.harness.mobile.conversation

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class PendingApproval(
    val rpcId: String,
    val sessionId: String,
    val approvalId: String,
    val title: String,
    val command: String,
)

sealed class MuxPatch {
    data class Event(val entry: JsonObject) : MuxPatch()
    data class Approval(val pending: PendingApproval) : MuxPatch()
    data object ApprovalClear : MuxPatch()
    data class Title(val value: String) : MuxPatch()
}

object Live {
    fun muxPatch(frame: JsonObject, sessionId: String): MuxPatch? {
        val payload = frame["payload"] as? JsonObject ?: return null
        if (payload["sessionId"]?.jsonPrimitive?.contentOrNull != sessionId) return null
        return when (payload["type"]?.jsonPrimitive?.contentOrNull) {
            "session/event" -> MuxPatch.Event(
                buildJsonObject {
                    payload["event"]?.let { put("event", it) }
                    payload["view"]?.let { put("view", it) }
                },
            )
            "approval/requested" -> MuxPatch.Approval(
                PendingApproval(
                    rpcId = frame["rpcId"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    sessionId = sessionId,
                    approvalId = payload["approvalId"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    title = payload["toolName"]?.jsonPrimitive?.contentOrNull ?: "需要审批",
                    command = payload["reason"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                ),
            )
            "approval/resolved" -> MuxPatch.ApprovalClear
            "session/projection" -> {
                if (payload["key"]?.jsonPrimitive?.contentOrNull != "title") return null
                val value = payload["value"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty().ifEmpty {
                    payload["value"]?.jsonObject?.get("title")?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
                }
                if (value.isEmpty()) null else MuxPatch.Title(value)
            }
            else -> null
        }
    }
}
