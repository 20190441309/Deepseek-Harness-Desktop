package ai.deepseek.harness.mobile

import ai.deepseek.harness.mobile.conversation.Bubble
import ai.deepseek.harness.mobile.conversation.Fold
import ai.deepseek.harness.mobile.conversation.Live
import ai.deepseek.harness.mobile.conversation.MuxPatch
import ai.deepseek.harness.mobile.conversation.PendingApproval
import ai.deepseek.harness.mobile.conversation.Title
import ai.deepseek.harness.mobile.git.BranchRef
import ai.deepseek.harness.mobile.git.GitQuickResolver
import ai.deepseek.harness.mobile.git.VcsStatus
import ai.deepseek.harness.mobile.git.parseBranchList
import ai.deepseek.harness.mobile.git.parseVcsStatus
import ai.deepseek.harness.mobile.host.Frames
import ai.deepseek.harness.mobile.host.Handshake
import ai.deepseek.harness.mobile.host.LoginClient
import ai.deepseek.harness.mobile.host.Prompt
import ai.deepseek.harness.mobile.host.Rpc
import ai.deepseek.harness.mobile.host.SessionRow
import ai.deepseek.harness.mobile.host.UnauthorizedException
import ai.deepseek.harness.mobile.pair.OfferCodec
import ai.deepseek.harness.mobile.shell.RemoteShell
import ai.deepseek.harness.mobile.store.DeviceStore
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.net.URI
import java.util.concurrent.TimeUnit

enum class Route { Connect, Permission, Scan, Chat }

data class DraftImage(val mediaType: String, val bytes: ByteArray)

class DshViewModel(private val store: DeviceStore) : ViewModel() {
    private val http = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .build()

    var route by mutableStateOf(Route.Connect)
    var pendingExternalUrl by mutableStateOf<String?>(null)
    var paste by mutableStateOf("")
    var error by mutableStateOf("")
    var banner by mutableStateOf("")
    var hostName by mutableStateOf("已连接")
    var cwd by mutableStateOf("")
    var sessions = mutableStateListOf<SessionRow>()
    var sessionId by mutableStateOf("")
    var events = mutableListOf<kotlinx.serialization.json.JsonElement>()
    var bubbles = mutableStateListOf<Bubble>()
    var draft by mutableStateOf("")
    var query by mutableStateOf("")
    var drawerOpen by mutableStateOf(false)
    var settingsOpen by mutableStateOf(false)
    var settingsPane by mutableStateOf("")
    var workspaceOpen by mutableStateOf(false)
    var wsTab by mutableStateOf("changes")
    var fileQuery by mutableStateOf("")
    var fileEntries = mutableStateListOf<String>()
    var gitBusy by mutableStateOf(false)
    var gitStatus by mutableStateOf(VcsStatus())
    var gitToast by mutableStateOf("")
    var commitMessage by mutableStateOf("")
    var gitDialog by mutableStateOf("")
    var gitConfirmAction by mutableStateOf("")
    var accessMode by mutableStateOf("只读")
    var branchQuery by mutableStateOf("")
    var branches = mutableStateListOf<BranchRef>()
    var newBranchName by mutableStateOf("")
    var pendingApproval by mutableStateOf<PendingApproval?>(null)
    var attachments = mutableStateListOf<DraftImage>()
    var lightbox by mutableStateOf<DraftImage?>(null)
    var attachOpen by mutableStateOf(false)
    var scheme by mutableStateOf(store.scheme)
    var glass by mutableIntStateOf(store.glass)
    var uiFont by mutableStateOf(store.uiFont)
    var gitTitle by mutableStateOf(store.gitTitle)
    var running by mutableStateOf(false)

    private var mux: WebSocket? = null
    private var hostWs: WebSocket? = null

    val gitQuick get() = GitQuickResolver.resolve(gitStatus, gitBusy)

    init {
        if (store.deviceToken.isNotEmpty() || store.origin.isNotEmpty()) {
            store.deviceToken = ""
            store.origin = ""
        }
    }

    fun titleFor(row: SessionRow): String = Title.sessionTitle(row)

    fun channelLabel(): String =
        if (store.origin.startsWith("https", ignoreCase = true)) "HTTPS 中继" else "局域网 :3180"

    fun gitStatusLine(): String {
        val parts = mutableListOf<String>()
        if (gitStatus.hasWorkingTreeChanges) parts.add("有未提交改动")
        if (gitStatus.aheadCount > 0) parts.add("领先 ${gitStatus.aheadCount}")
        if (gitStatus.behindCount > 0) parts.add("落后 ${gitStatus.behindCount}")
        gitStatus.pr?.takeIf { it.state == "open" }?.number?.let { parts.add("PR #$it") }
        if (parts.isEmpty()) parts.add("已与上游同步")
        return "${gitStatus.refName ?: "—"} · ${parts.joinToString(" · ")}"
    }

    fun filteredSessions(): List<SessionRow> {
        val q = query.trim()
        return sessions.filter { q.isEmpty() || titleFor(it).contains(q) }
    }

    fun connectFromPaste() {
        pair(paste)
    }

    fun onScanned(raw: String) {
        pair(raw)
    }

    fun pair(text: String) {
        viewModelScope.launch {
            error = ""
            try {
                val trimmed = text.trim()
                withContext(Dispatchers.IO) {
                    OfferCodec.fromPaste(trimmed)
                        ?: throw IllegalArgumentException("无效的配对链接（需要 ChisaCode offer v2）")
                }
                // Native DaemonClient is not wired yet — hand off to the mobile web SPA.
                store.deviceToken = ""
                if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                    pendingExternalUrl = trimmed
                    route = Route.Connect
                } else {
                    error = "请用系统相机扫描桌面二维码（完整链接）"
                    route = Route.Connect
                }
            } catch (ex: UnauthorizedException) {
                store.deviceToken = ""
                route = Route.Connect
                error = ex.message ?: "配对无效"
            } catch (ex: Exception) {
                error = ex.message ?: "连接失败"
            }
        }
    }

    fun unbind() {
        store.deviceToken = ""
        store.origin = ""
        closeSockets()
        route = Route.Connect
        settingsOpen = false
        sessions.clear()
    }

    fun openDrawer() { drawerOpen = true }
    fun closeDrawer() { drawerOpen = false }

    fun selectSession(id: String) {
        sessionId = id
        drawerOpen = false
        viewModelScope.launch { loadHistory() }
    }

    fun newSession() {
        viewModelScope.launch {
            try {
                val created = withContext(Dispatchers.IO) {
                    Rpc.callUnary(http, store.origin, "session.create", buildJsonObject {}, store.deviceToken)
                }
                val id = created.value?.jsonObject?.get("sessionId")?.jsonPrimitive?.contentOrNull
                    ?: created.value?.jsonObject?.get("id")?.jsonPrimitive?.contentOrNull
                if (!created.ok || id.isNullOrEmpty()) throw IllegalStateException(created.error ?: "无法创建会话")
                sessionId = id
                events.clear()
                bubbles.clear()
                pendingApproval = null
                drawerOpen = false
            } catch (ex: Exception) {
                banner = ex.message ?: "无法创建会话"
            }
        }
    }

    fun send() {
        val text = draft.trim()
        val images = attachments.toList()
        if (text.isEmpty() && images.isEmpty()) return
        if (pendingApproval != null) return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val blocks = buildList {
                        if (text.isNotEmpty()) add(Prompt.textBlock(text))
                        images.forEach { add(Prompt.imageBlock(it.mediaType, it.bytes)) }
                    }
                    val payload = buildJsonObject {
                        put("sessionId", sessionId)
                        Prompt.payload(blocks).forEach { (k, v) -> put(k, v) }
                    }
                    val result = Rpc.callUnary(http, store.origin, "session.prompt", payload, store.deviceToken)
                    if (!result.ok) throw IllegalStateException(result.error ?: "发送失败")
                }
                draft = ""
                attachments.clear()
            } catch (ex: UnauthorizedException) {
                unbind()
                error = "登录已失效"
            } catch (ex: Exception) {
                banner = ex.message ?: "发送失败"
            }
        }
    }

    fun answer(outcome: String) {
        val pending = pendingApproval ?: return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Rpc.respond(
                        http,
                        store.origin,
                        pending.rpcId,
                        buildJsonObject {
                            put("sessionId", pending.sessionId)
                            put("approvalId", pending.approvalId)
                            put("outcome", outcome)
                        },
                        store.deviceToken,
                    )
                }
                pendingApproval = null
            } catch (ex: Exception) {
                banner = ex.message ?: "审批失败"
            }
        }
    }

    fun persistScheme(value: String) {
        scheme = value
        store.scheme = value
    }

    fun persistGlass(value: Int) {
        glass = value
        store.glass = value
    }

    fun persistFont(value: String) {
        uiFont = value
        store.uiFont = value
    }

    fun persistGitTitle(value: Boolean) {
        gitTitle = value
        store.gitTitle = value
    }

    fun cancelRun() {
        if (sessionId.isEmpty()) return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Rpc.callUnary(
                        http,
                        store.origin,
                        "session.cancel",
                        buildJsonObject { put("sessionId", sessionId) },
                        store.deviceToken,
                    )
                }
            } catch (ex: Exception) {
                banner = ex.message ?: "无法停止"
            }
        }
    }

    fun requestHost(name: String, payload: JsonObject = buildJsonObject {}) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    RemoteShell.call(http, store.origin, store.deviceToken, name, payload)
                }
                banner = when (name) {
                    "openGallery" -> "已请求电脑打开外观。请在电脑上点浏览图库。"
                    "openSettings" -> "已请求在电脑打开设置"
                    else -> "已发送到电脑"
                }
            } catch (ex: Exception) {
                banner = ex.message ?: "电脑没有响应"
            }
        }
    }

    fun refreshGit() {
        if (cwd.isEmpty()) return
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    RemoteShell.call(
                        http,
                        store.origin,
                        store.deviceToken,
                        "gitStatus",
                        buildJsonObject { put("cwd", cwd) },
                    )
                }
                gitStatus = parseVcsStatus(result)
            } catch (ex: Exception) {
                gitToast = ex.message ?: "Git 状态不可用"
            }
        }
    }

    fun loadFiles() {
        if (cwd.isEmpty()) return
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    RemoteShell.call(
                        http,
                        store.origin,
                        store.deviceToken,
                        "listDir",
                        buildJsonObject {
                            put("cwd", cwd)
                            put("relativePath", "")
                        },
                    )
                }
                val names = result["entries"]?.jsonArray?.mapNotNull { entry ->
                    val obj = entry.jsonObject
                    val name = obj["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                    val kind = obj["kind"]?.jsonPrimitive?.contentOrNull
                    if (kind == "directory") "$name/" else name
                }.orEmpty()
                fileEntries.clear()
                fileEntries.addAll(names)
            } catch (ex: Exception) {
                banner = ex.message ?: "无法列出文件"
            }
        }
    }

    fun runGitPrimary() {
        val quick = gitQuick
        when {
            quick.disabled -> gitToast = quick.hint
            quick.kind == "run_pull" -> gitAction("gitPull")
            quick.action == "commit" || quick.action == "commit_push" || quick.action == "commit_push_pr" ->
                gitDialog = "commit"
            quick.action == "push" -> maybeConfirm("gitPush")
            quick.action == "create_pr" -> maybeConfirm("gitCreateChangeRequest")
            quick.kind == "open_publish" -> {
                banner = "请在电脑上发布仓库"
                gitToast = "发布仓库不可用"
            }
            quick.kind == "open_pr" -> {
                banner = "已在电脑上打开拉取请求"
                gitToast = gitStatus.pr?.number?.let { "打开拉取请求 #$it" } ?: "打开拉取请求"
            }
            else -> gitToast = quick.hint
        }
    }

    fun maybeConfirm(name: String, extra: JsonObject = buildJsonObject {}) {
        if (gitStatus.isDefaultRef && (name == "gitPush" || name == "gitCreateChangeRequest")) {
            gitConfirmAction = name
            gitDialog = "confirm"
        } else {
            gitAction(name, extra)
        }
    }

    fun confirmDefaultGit() {
        val name = gitConfirmAction
        gitConfirmAction = ""
        gitDialog = ""
        if (name.isNotEmpty()) gitAction(name)
    }

    fun gitAction(name: String, extra: JsonObject = buildJsonObject {}) {
        if (cwd.isEmpty()) return
        viewModelScope.launch {
            gitBusy = true
            try {
                withContext(Dispatchers.IO) {
                    val payload = buildJsonObject {
                        put("cwd", cwd)
                        extra.forEach { (k, v) -> put(k, v) }
                    }
                    RemoteShell.call(http, store.origin, store.deviceToken, name, payload)
                }
                gitDialog = ""
                gitToast = "完成"
                refreshGit()
            } catch (ex: Exception) {
                gitToast = ex.message ?: "Git 失败"
            } finally {
                gitBusy = false
            }
        }
    }

    fun loadBranches() {
        if (cwd.isEmpty()) return
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    RemoteShell.call(
                        http,
                        store.origin,
                        store.deviceToken,
                        "gitBranchList",
                        buildJsonObject { put("cwd", cwd) },
                    )
                }
                branches.clear()
                branches.addAll(parseBranchList(result))
                gitDialog = "branch"
            } catch (ex: Exception) {
                gitToast = ex.message ?: "无法列出分支"
            }
        }
    }

    fun switchBranch(ref: String) {
        gitAction("gitSwitchBranch", buildJsonObject { put("ref", ref) })
    }

    fun createBranch() {
        val name = newBranchName.trim()
        if (name.isEmpty()) return
        gitAction("gitCreateBranch", buildJsonObject { put("name", name) })
        newBranchName = ""
    }

    fun insertMention(path: String) {
        draft = if (draft.isEmpty()) "@$path " else "${draft.trimEnd()} @$path "
        workspaceOpen = false
        settingsOpen = false
    }

    fun removeAttachment(index: Int) {
        if (index in attachments.indices) attachments.removeAt(index)
        if (lightbox != null && lightbox !in attachments) lightbox = null
    }

    private suspend fun resume() {
        try {
            val origin = store.origin
            val token = store.deviceToken
            val handshake = withContext(Dispatchers.IO) {
                Handshake.run(
                    call = { method, payload -> Rpc.callUnary(http, origin, method, payload, token) },
                    connectEvents = { },
                )
            }
            val hostObj = handshake.host as? JsonObject
            cwd = hostObj?.get("cwd")?.jsonPrimitive?.contentOrNull.orEmpty()
            hostName = Frames.hostLabel(hostObj)
            sessions.clear()
            sessions.addAll(Frames.sessionsFromList(handshake.sessions))
            if (sessionId.isEmpty()) sessionId = sessions.firstOrNull()?.sessionId.orEmpty()
            openSockets()
            route = Route.Chat
            if (sessionId.isNotEmpty()) loadHistory()
            refreshGit()
        } catch (ex: UnauthorizedException) {
            store.deviceToken = ""
            route = Route.Connect
            error = "登录已失效"
        } catch (ex: Exception) {
            route = Route.Connect
            error = ex.message ?: "握手失败"
        }
    }

    private suspend fun loadHistory() {
        if (sessionId.isEmpty()) return
        try {
            val result = withContext(Dispatchers.IO) {
                Rpc.callUnary(
                    http,
                    store.origin,
                    "session.history",
                    buildJsonObject { put("sessionId", sessionId) },
                    store.deviceToken,
                )
            }
            val list = (result.value as? JsonObject)?.get("events") as? JsonArray
            events.clear()
            if (list != null) events.addAll(list)
            bubbles.clear()
            bubbles.addAll(Fold.foldEvents(events))
            running = sessions.find { it.sessionId == sessionId }?.running == true
        } catch (ex: Exception) {
            banner = ex.message ?: "无法加载会话"
        }
    }

    private fun openSockets() {
        closeSockets()
        val token = store.deviceToken
        val origin = store.origin
        fun listener(onFrame: (JsonObject) -> Unit) = object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val env = Rpc.parseEnvelope(text) ?: return
                onFrame(env)
            }
        }
        mux = http.newWebSocket(
            Request.Builder().url(Rpc.toWs(origin, "/api/events.mux")).header("Authorization", "Bearer $token").build(),
            listener { frame ->
                viewModelScope.launch {
                    when (val patch = Live.muxPatch(frame, sessionId)) {
                        is MuxPatch.Event -> {
                            events.add(patch.entry)
                            bubbles.clear()
                            bubbles.addAll(Fold.foldEvents(events))
                        }
                        is MuxPatch.Approval -> pendingApproval = patch.pending
                        MuxPatch.ApprovalClear -> pendingApproval = null
                        is MuxPatch.Title -> {
                            val index = sessions.indexOfFirst { it.sessionId == sessionId }
                            if (index >= 0) sessions[index] = sessions[index].copy(blank = false, title = patch.value)
                        }
                        null -> Unit
                    }
                }
            },
        )
        hostWs = http.newWebSocket(
            Request.Builder().url(Rpc.toWs(origin, "/api/events.host")).header("Authorization", "Bearer $token").build(),
            listener { frame ->
                viewModelScope.launch {
                    val payload = frame["payload"] as? JsonObject
                    val next = Frames.applyHostFrame(sessions.toList(), payload)
                    sessions.clear()
                    sessions.addAll(next)
                    running = sessions.find { it.sessionId == sessionId }?.running == true
                }
            },
        )
    }

    private fun closeSockets() {
        mux?.cancel()
        hostWs?.cancel()
        mux = null
        hostWs = null
    }

    override fun onCleared() {
        closeSockets()
        super.onCleared()
    }

    companion object {
        fun originOf(text: String): String? {
            return try {
                val uri = URI(text.trim())
                if (uri.scheme.isNullOrEmpty() || uri.host.isNullOrEmpty()) null
                else "${uri.scheme}://${uri.authority}"
            } catch (_: Exception) {
                null
            }
        }
    }
}
