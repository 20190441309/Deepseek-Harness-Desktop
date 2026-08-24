package ai.deepseek.harness.mobile.host

import kotlinx.serialization.json.Json
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

object LoginClient {
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val json = Json { ignoreUnknownKeys = true }

    fun login(http: OkHttpClient, origin: String, pairingToken: String): String {
        if (pairingToken.isEmpty()) {
            throw IllegalArgumentException("配对链接里没有密钥")
        }
        val body = buildJsonObject { put("token", pairingToken) }
        val request = Request.Builder()
            .url(Rpc.apiUrl(origin, "/__remote__/login"))
            .header("accept", "application/json")
            .header("content-type", "application/json")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 || response.code == 403) {
                throw UnauthorizedException("配对密钥无效")
            }
            if (!response.isSuccessful) {
                throw IllegalStateException("登录失败（${response.code}）")
            }
            val parsed = json.parseToJsonElement(text).jsonObject
            if (parsed["ok"]?.jsonPrimitive?.booleanOrNull != true) {
                throw UnauthorizedException(parsed["error"]?.jsonPrimitive?.contentOrNull ?: "配对密钥无效")
            }
            val device = parsed["deviceToken"]?.jsonPrimitive?.contentOrNull
            if (device.isNullOrEmpty()) {
                throw IllegalStateException("登录失败（没有设备令牌）")
            }
            return device
        }
    }
}
