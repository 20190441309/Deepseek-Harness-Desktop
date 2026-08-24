package ai.deepseek.harness.mobile.shell

import ai.deepseek.harness.mobile.host.Rpc
import ai.deepseek.harness.mobile.host.UnauthorizedException
import kotlinx.serialization.json.Json
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

object RemoteShell {
    val NAMES = setOf(
        "gitStatus",
        "gitFetchForStatus",
        "gitDiff",
        "gitCommit",
        "gitPush",
        "gitPull",
        "gitBranchList",
        "gitSwitchBranch",
        "gitCreateBranch",
        "gitCreateChangeRequest",
        "listDir",
        "openSettings",
        "openGallery",
        "getConfig",
        "saveConfig",
    )

    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val json = Json { ignoreUnknownKeys = true }

    fun call(
        http: OkHttpClient,
        origin: String,
        deviceToken: String,
        name: String,
        payload: JsonObject = buildJsonObject {},
    ): JsonObject {
        if (name !in NAMES) {
            throw IllegalArgumentException("not found")
        }
        val request = Request.Builder()
            .url(Rpc.apiUrl(origin, "/__remote__/shell/$name"))
            .header("Authorization", "Bearer $deviceToken")
            .header("content-type", "application/json")
            .post(payload.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 || response.code == 403) {
                throw UnauthorizedException("unauthorized")
            }
            if (response.code == 404) {
                throw IllegalArgumentException("not found")
            }
            val parsed = json.parseToJsonElement(text).jsonObject
            if (parsed["ok"]?.jsonPrimitive?.booleanOrNull != true) {
                throw IllegalStateException(parsed["error"]?.jsonPrimitive?.contentOrNull ?: "请求失败")
            }
            return parsed["result"]?.jsonObject ?: buildJsonObject { put("ok", true) }
        }
    }
}
