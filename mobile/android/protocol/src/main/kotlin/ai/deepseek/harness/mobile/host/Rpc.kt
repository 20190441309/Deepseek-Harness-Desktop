package ai.deepseek.harness.mobile.host

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.security.SecureRandom

class UnauthorizedException(message: String) : Exception(message)

data class UnaryResult(
    val rpcId: String,
    val ok: Boolean,
    val value: JsonElement? = null,
    val error: String? = null,
)

object Rpc {
    private val random = SecureRandom()
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val json = Json { ignoreUnknownKeys = true }

    fun mintRpcId(): String {
        val bytes = ByteArray(16)
        random.nextBytes(bytes)
        bytes[6] = ((bytes[6].toInt() and 0x0f) or 0x40).toByte()
        bytes[8] = ((bytes[8].toInt() and 0x3f) or 0x80).toByte()
        val hex = bytes.joinToString("") { b -> "%02x".format(b) }
        return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}"
    }

    fun apiUrl(origin: String, path: String): String = origin.trimEnd('/') + path

    fun toWs(origin: String, path: String): String {
        val url = URI(apiUrl(origin, path))
        val scheme = if (url.scheme == "https") "wss" else "ws"
        return URI(scheme, url.authority, url.path, url.query, url.fragment).toString().trimEnd('/')
    }

    fun parseEnvelope(text: String): JsonObject? {
        return try {
            val full = json.parseToJsonElement(text).jsonObject
            if (full["type"]?.jsonPrimitive?.contentOrNull != "server-request") null else full
        } catch (_: Exception) {
            null
        }
    }

    fun postJson(
        http: OkHttpClient,
        origin: String,
        path: String,
        body: JsonObject,
        deviceToken: String,
    ): JsonObject {
        val request = Request.Builder()
            .url(apiUrl(origin, path))
            .header("content-type", "application/json")
            .apply {
                if (deviceToken.isNotEmpty()) header("Authorization", "Bearer $deviceToken")
            }
            .post(body.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 || response.code == 403) {
                throw UnauthorizedException("unauthorized")
            }
            if (!response.isSuccessful) {
                throw IllegalStateException("transport failure for $path: HTTP ${response.code}")
            }
            return json.parseToJsonElement(text).jsonObject
        }
    }

    fun callUnary(
        http: OkHttpClient,
        origin: String,
        method: String,
        payload: JsonObject,
        deviceToken: String,
    ): UnaryResult {
        val rpcId = mintRpcId()
        val envelope = buildJsonObject {
            put("type", "client-request")
            put("rpcId", rpcId)
            put("method", method)
            put("payload", payload)
        }
        val full = postJson(http, origin, "/api/$method", envelope, deviceToken)
        val echoed = full["rpcId"]?.jsonPrimitive?.contentOrNull
        if (echoed != rpcId) {
            throw IllegalStateException("rpcId mismatch for $method: sent $rpcId, got $echoed")
        }
        if (full["type"]?.jsonPrimitive?.contentOrNull != "server-response") {
            throw IllegalStateException("unexpected response type for $method")
        }
        val result = full["result"]?.jsonObject
        if (result?.get("ok")?.jsonPrimitive?.booleanOrNull != true) {
            val message = result?.get("error")?.jsonObject?.get("message")?.jsonPrimitive?.contentOrNull
                ?: "request failed"
            return UnaryResult(rpcId = rpcId, ok = false, error = message)
        }
        return UnaryResult(rpcId = rpcId, ok = true, value = result["value"])
    }

    fun respond(
        http: OkHttpClient,
        origin: String,
        rpcId: String,
        value: JsonObject,
        deviceToken: String,
    ): JsonObject {
        val body = buildJsonObject {
            put("type", "client-response")
            put("rpcId", rpcId)
            put("result", buildJsonObject {
                put("ok", true)
                put("value", value)
            })
        }
        return postJson(http, origin, "/api/respond", body, deviceToken)
    }
}
