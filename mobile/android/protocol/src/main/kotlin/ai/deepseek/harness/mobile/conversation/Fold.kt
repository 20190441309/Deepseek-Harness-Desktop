package ai.deepseek.harness.mobile.conversation

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class ImagePart(val mediaType: String, val data: String)

data class Bubble(
    val id: String,
    val role: String,
    val text: String,
    val card: String? = null,
    val images: List<ImagePart> = emptyList(),
)

object Fold {
    fun foldEvents(entries: List<JsonElement>): List<Bubble> {
        val rows = mutableListOf<Bubble>()
        var assistant: Bubble? = null
        fun flushAssistant() {
            assistant?.let { rows.add(it) }
            assistant = null
        }
        for (entry in entries) {
            val obj = entry as? JsonObject ?: continue
            val event = obj["event"] as? JsonObject ?: obj
            val type = event["type"]?.jsonPrimitive?.contentOrNull ?: continue
            val seq = event["seq"]?.jsonPrimitive?.contentOrNull ?: ""
            val data = event["data"] as? JsonObject
            when (type) {
                "user/message" -> {
                    val kind = data?.get("source")?.jsonObject?.get("kind")?.jsonPrimitive?.contentOrNull
                    if (kind != "user") continue
                    flushAssistant()
                    val id = data["id"]?.jsonPrimitive?.contentOrNull ?: seq
                    rows.add(
                        Bubble(
                            id = id,
                            role = "user",
                            text = textFromBlocks(data["content"]),
                            images = imagesFromBlocks(data["content"]),
                        ),
                    )
                }
                "assistant/chunk" -> {
                    if (assistant == null) {
                        assistant = Bubble(id = "assistant-$seq", role = "assistant", text = "")
                    }
                    assistant = assistant!!.copy(text = assistant!!.text + chunkText(data))
                }
                "assistant/message" -> {
                    val content = data?.get("message")?.jsonObject?.get("content")
                    assistant = Bubble(
                        id = "assistant-$seq",
                        role = "assistant",
                        text = textFromBlocks(content),
                    )
                    flushAssistant()
                }
                "tool/call" -> {
                    flushAssistant()
                    val card = obj["view"]?.jsonObject?.get("view")?.jsonObject?.get("card")
                        ?.jsonPrimitive?.contentOrNull
                        ?: data?.get("name")?.jsonPrimitive?.contentOrNull
                        ?: "tool"
                    rows.add(
                        Bubble(
                            id = data?.get("callId")?.jsonPrimitive?.contentOrNull ?: seq,
                            role = "tool",
                            text = data?.get("name")?.jsonPrimitive?.contentOrNull.orEmpty(),
                            card = card,
                        ),
                    )
                }
            }
        }
        flushAssistant()
        return rows
    }

    private fun textFromBlocks(blocks: JsonElement?): String {
        val array = blocks as? JsonArray ?: return ""
        return array.joinToString("") { block ->
            val obj = block as? JsonObject ?: return@joinToString ""
            obj["text"]?.jsonPrimitive?.contentOrNull ?: ""
        }
    }

    private fun imagesFromBlocks(blocks: JsonElement?): List<ImagePart> {
        val array = blocks as? JsonArray ?: return emptyList()
        return array.mapNotNull { block ->
            val obj = block as? JsonObject ?: return@mapNotNull null
            if (obj["type"]?.jsonPrimitive?.contentOrNull != "image") return@mapNotNull null
            val media = obj["mediaType"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val data = obj["data"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            ImagePart(mediaType = media, data = data)
        }
    }

    private fun chunkText(data: JsonObject?): String {
        val chunk = data?.get("chunk")
        if (chunk is JsonObject) {
            return chunk["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
        }
        chunk?.jsonPrimitive?.contentOrNull?.let { return it }
        return data?.get("text")?.jsonPrimitive?.contentOrNull.orEmpty()
    }
}
