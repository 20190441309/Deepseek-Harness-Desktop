package ai.deepseek.harness.mobile.host

import kotlinx.serialization.json.add
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Base64

object Prompt {
    private val allowed = setOf("image/png", "image/jpeg", "image/webp", "image/gif")

    fun textBlock(text: String): JsonObject = buildJsonObject {
        put("type", "text")
        put("text", text)
    }

    fun imageBlock(mediaType: String, bytes: ByteArray): JsonObject {
        require(mediaType in allowed) { "unsupported image type" }
        return buildJsonObject {
            put("type", "image")
            put("mediaType", mediaType)
            put("data", Base64.getEncoder().encodeToString(bytes))
        }
    }

    fun payload(blocks: List<JsonObject>): JsonObject = buildJsonObject {
        put("mode", "queue")
        put("content", buildJsonArray { blocks.forEach { add(it) } })
    }
}
