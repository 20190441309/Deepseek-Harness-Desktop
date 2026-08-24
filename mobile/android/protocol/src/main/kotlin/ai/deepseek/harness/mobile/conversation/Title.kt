package ai.deepseek.harness.mobile.conversation

import ai.deepseek.harness.mobile.host.SessionRow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

object Title {
    fun sessionTitle(row: SessionRow, projections: JsonObject? = null): String {
        if (row.blank) return "新会话"
        val fromRow = row.title?.trim().orEmpty()
        if (fromRow.isNotEmpty()) return fromRow
        val fromProj = projections?.get("values")?.jsonObject?.get("title")?.jsonPrimitive?.contentOrNull?.trim()
        if (!fromProj.isNullOrEmpty()) return fromProj
        val id = row.sessionId
        return if (id.length >= 7) id.substring(0, 7) else id.ifEmpty { "会话" }
    }
}
