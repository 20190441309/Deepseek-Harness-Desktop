package ai.deepseek.harness.mobile.pair

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.util.Base64

data class Offer(
    val v: Int,
    val token: String,
    val mode: String,
    val relay: String,
)

object OfferCodec {
    const val VERSION = 1

    fun decode(raw: String?): Offer? {
        if (raw.isNullOrBlank()) return null
        return try {
            val padded = raw.replace('-', '+').replace('_', '/')
            val pad = (4 - padded.length % 4) % 4
            val bytes = Base64.getDecoder().decode(padded + "=".repeat(pad))
            val value = Json.parseToJsonElement(String(bytes, Charsets.UTF_8)).jsonObject
            val token = value["token"]?.jsonPrimitive?.contentOrNull
            val v = value["v"]?.jsonPrimitive?.intOrNull
            if (v != VERSION || token.isNullOrEmpty()) return null
            Offer(
                v = VERSION,
                token = token,
                mode = if (value["mode"]?.jsonPrimitive?.contentOrNull == "relay") "relay" else "lan",
                relay = value["relay"]?.jsonPrimitive?.contentOrNull ?: "",
            )
        } catch (_: Exception) {
            null
        }
    }

    fun fromHash(hash: String?): Offer? {
        val match = Regex("(?:^|#|&)offer=([^&]+)").find(hash ?: "") ?: return null
        return decode(match.groupValues[1])
    }

    fun fromPaste(value: String?): Offer? {
        val text = value?.trim().orEmpty()
        if (text.isEmpty()) return null
        fromHash(if (text.startsWith("#")) text else "#$text")?.let { return it }
        return try {
            fromHash(URI(text).fragment?.let { "#$it" } ?: "")
        } catch (_: Exception) {
            null
        }
    }
}
