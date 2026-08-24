package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.DraftImage
import ai.deepseek.harness.mobile.DshViewModel
import ai.deepseek.harness.mobile.Route
import ai.deepseek.harness.mobile.conversation.Bubble
import ai.deepseek.harness.mobile.git.GitQuick
import ai.deepseek.harness.mobile.ui.theme.DshIcons
import ai.deepseek.harness.mobile.ui.theme.dsh
import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.ByteArrayOutputStream

private val Capsule = RoundedCornerShape(18.dp)
private val Menu = RoundedCornerShape(12.dp)
private val Dialog = RoundedCornerShape(16.dp)
private val ComposerShape = RoundedCornerShape(22.dp)
private val IconBtn = RoundedCornerShape(28.dp)

@Composable
fun DshRoot(vm: DshViewModel, onRequestScan: () -> Unit, onOpenAppSettings: () -> Unit) {
    val palette = dsh()
    Box(Modifier.fillMaxSize().background(palette.bgBase)) {
        when (vm.route) {
            Route.Connect -> ConnectScreen(vm, onRequestScan)
            Route.Permission -> PermissionScreen(vm, onOpenAppSettings)
            Route.Scan -> Unit
            Route.Chat -> ChatScreen(vm)
        }
    }
}

@Composable
fun ConnectScreen(vm: DshViewModel, onRequestScan: () -> Unit) {
    val p = dsh()
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("手机远程", color = p.labelTertiary, fontSize = 13.sp, lineHeight = 20.sp)
            Text("连接到这台电脑", color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "用应用扫桌面侧栏远程弹窗里的二维码。密钥在 #offer=，不会进查询串。",
                color = p.labelSecondary,
                fontSize = 14.sp,
                lineHeight = 22.sp,
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(p.labelCaption))
            Text("等待配对", color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp)
        }
        if (vm.error.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text(vm.error, color = p.error, fontSize = 12.sp, lineHeight = 18.sp)
        }
        Spacer(Modifier.height(12.dp))
        DshPrimaryButton("扫描二维码", onClick = onRequestScan)
        Spacer(Modifier.height(12.dp))
        DshField(value = vm.paste, onValueChange = { vm.paste = it }, placeholder = "http://192.168.1.23:3180/#offer=…")
        Spacer(Modifier.height(12.dp))
        DshGhostButton("用链接连接", onClick = { vm.connectFromPaste() })
    }
}

@Composable
fun PermissionScreen(vm: DshViewModel, onOpenAppSettings: () -> Unit) {
    val p = dsh()
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text("需要相机权限", color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "扫码要用相机。系统权限窗由 Android 弹出；拒绝后可以只粘贴配对链接。",
            color = p.labelSecondary,
            fontSize = 14.sp,
            lineHeight = 22.sp,
        )
        DshPrimaryButton("去系统设置", onClick = onOpenAppSettings)
        DshGhostButton("改用粘贴链接", onClick = { vm.route = Route.Connect })
    }
}

@Composable
fun ChatScreen(vm: DshViewModel) {
    val p = dsh()
    val context = LocalContext.current
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        context.contentResolver.openInputStream(uri)?.use { input ->
            val bytes = input.readBytes()
            val type = context.contentResolver.getType(uri) ?: "image/jpeg"
            val media = when {
                type.contains("png") -> "image/png"
                type.contains("webp") -> "image/webp"
                type.contains("gif") -> "image/gif"
                else -> "image/jpeg"
            }
            vm.attachments.add(DraftImage(media, bytes))
        }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        bitmap ?: return@rememberLauncherForActivityResult
        val out = ByteArrayOutputStream()
        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, out)
        vm.attachments.add(DraftImage("image/jpeg", out.toByteArray()))
    }
    val cameraPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) camera.launch(null)
    }
    BackHandler(
        enabled = vm.lightbox != null || vm.attachOpen || vm.gitDialog.isNotEmpty() || vm.settingsOpen || vm.drawerOpen,
    ) {
        when {
            vm.lightbox != null -> vm.lightbox = null
            vm.attachOpen -> vm.attachOpen = false
            vm.gitDialog.isNotEmpty() -> vm.gitDialog = ""
            vm.settingsOpen -> if (vm.settingsPane.isNotEmpty()) vm.settingsPane = "" else vm.settingsOpen = false
            else -> vm.closeDrawer()
        }
    }
    LaunchedEffect(vm.gitToast, vm.gitBusy) {
        if (!vm.gitBusy && vm.gitToast.isNotEmpty()) {
            delay(2400)
            vm.gitToast = ""
        }
    }
    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).imePadding()) {
        Column(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 56.dp, end = 16.dp, top = 8.dp, bottom = 10.dp),
            ) {
                Column {
                    val row = vm.sessions.find { it.sessionId == vm.sessionId }
                    Text(
                        row?.let { vm.titleFor(it) } ?: "新会话",
                        color = p.labelPrimary,
                        fontSize = 16.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            vm.hostName,
                            color = p.labelTertiary,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (vm.gitTitle && vm.gitStatus.refName != null) {
                            Spacer(Modifier.width(8.dp))
                            Box(
                                Modifier
                                    .height(22.dp)
                                    .clip(RoundedCornerShape(11.dp))
                                    .border(1.dp, p.borderL2, RoundedCornerShape(11.dp))
                                    .then(
                                        dshClickable {
                                            vm.workspaceOpen = true
                                            vm.settingsOpen = true
                                            vm.settingsPane = "工作区"
                                            vm.refreshGit()
                                        },
                                    )
                                    .padding(horizontal = 8.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "${vm.gitStatus.refName} · ${vm.gitStatus.aheadCount}",
                                    color = p.labelSecondary,
                                    fontSize = 12.sp,
                                    lineHeight = 18.sp,
                                )
                            }
                        }
                        if (vm.running) {
                            Spacer(Modifier.width(8.dp))
                            Text("运行中", color = p.buttonInfoFill, fontSize = 12.sp, lineHeight = 18.sp)
                        }
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.borderL2))
            if (vm.banner.isNotEmpty()) {
                Text(
                    vm.banner,
                    color = p.error,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(p.hoverDanger)
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .fillMaxWidth(),
                )
            }
            if (vm.bubbles.isEmpty()) {
                Column(
                    Modifier.weight(1f).padding(start = 24.dp, end = 24.dp, top = 24.dp, bottom = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                ) {
                    Text("新会话", color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
                    Text("描述你想要构建的内容。工作区仍是电脑上的那一个。", color = p.labelSecondary, fontSize = 14.sp, lineHeight = 22.sp)
                }
            } else {
                LazyColumn(
                    Modifier.weight(1f).padding(horizontal = 16.dp, vertical = 8.dp),
                    reverseLayout = true,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    items(vm.bubbles.asReversed(), key = { it.id }) { bubble ->
                        MessageBubble(bubble)
                    }
                }
            }
            ComposerBar(vm = vm)
        }
        if (!vm.drawerOpen) {
            IconHit(
                vector = DshIcons.Menu,
                tint = p.labelPrimary,
                onClick = { vm.openDrawer() },
                modifier = Modifier
                    .zIndex(8f)
                    .padding(start = 10.dp, top = 8.dp)
                    .shadow(4.dp, Menu)
                    .background(p.buttonFloating, Menu),
                shape = Menu,
            )
        }
        AnimatedVisibility(
            visible = vm.drawerOpen,
            modifier = Modifier.fillMaxSize().zIndex(14f),
            enter = maskEnter(),
            exit = maskExit(),
        ) {
            Box(Modifier.fillMaxSize().background(p.mask).then(dshClickable(ripple = false) { vm.closeDrawer() }))
        }
        AnimatedVisibility(
            visible = vm.drawerOpen,
            modifier = Modifier.fillMaxSize().zIndex(15f),
            enter = drawerEnter(),
            exit = drawerExit(),
        ) {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val width = minOf(320.dp, maxWidth - 48.dp)
                Drawer(vm, Modifier.width(width).fillMaxHeight())
            }
        }
        AnimatedVisibility(
            visible = vm.settingsOpen,
            modifier = Modifier.fillMaxSize().zIndex(18f),
            enter = overlayEnter(),
            exit = overlayExit(),
        ) {
            SettingsOverlay(vm)
        }
        AttachSheet(vm, onPickCamera = {
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
            if (granted) camera.launch(null) else cameraPerm.launch(Manifest.permission.CAMERA)
        }, onPickGallery = { gallery.launch("image/*") })
        GitLayers(vm)
        GitToast(vm)
        AnimatedVisibility(
            visible = vm.lightbox != null,
            modifier = Modifier.fillMaxSize().zIndex(35f),
            enter = overlayEnter(),
            exit = overlayExit(),
        ) {
            val img = vm.lightbox ?: return@AnimatedVisibility
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Box(Modifier.fillMaxSize().background(p.mask).then(dshClickable(ripple = false) { vm.lightbox = null }))
                val bmp = BitmapFactory.decodeByteArray(img.bytes, 0, img.bytes.size)
                if (bmp != null) {
                    Image(
                        bmp.asImageBitmap(),
                        null,
                        Modifier
                            .fillMaxWidth()
                            .padding(24.dp)
                            .shadow(12.dp, Menu)
                            .clip(Menu),
                        contentScale = ContentScale.Fit,
                    )
                }
                IconHit(
                    vector = DshIcons.Close,
                    tint = p.labelPrimary,
                    onClick = { vm.lightbox = null },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 8.dp, end = 16.dp)
                        .shadow(4.dp, CircleShape)
                        .background(p.inputMajor, CircleShape),
                    shape = CircleShape,
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(bubble: Bubble) {
    val p = dsh()
    val align = if (bubble.role == "user") Alignment.End else Alignment.Start
    Column(Modifier.fillMaxWidth(), horizontalAlignment = align) {
        if (bubble.role == "tool") {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(Menu)
                    .border(1.dp, p.borderL1, Menu)
                    .background(p.bgLayer1)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        bubble.card ?: bubble.text,
                        color = p.labelSecondary,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                if (bubble.text.isNotEmpty() && bubble.text != bubble.card) {
                    Text(
                        bubble.text,
                        color = p.labelTertiary,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        } else {
            val bg = if (bubble.role == "user") p.bubble else Color.Transparent
            Column(
                Modifier
                    .fillMaxWidth(if (bubble.role == "user") 0.86f else 1f)
                    .clip(RoundedCornerShape(16.dp))
                    .background(bg)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalAlignment = if (bubble.role == "user") Alignment.End else Alignment.Start,
            ) {
                if (bubble.images.isNotEmpty()) {
                    Row(
                        Modifier.padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        bubble.images.forEach { img ->
                            val bytes = android.util.Base64.decode(img.data, android.util.Base64.DEFAULT)
                            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                            if (bmp != null) {
                                Image(
                                    bmp.asImageBitmap(),
                                    null,
                                    Modifier.size(if (bubble.images.size == 1) 180.dp else 64.dp).clip(RoundedCornerShape(16.dp)),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                        }
                    }
                }
                if (bubble.text.isNotEmpty()) {
                    Text(bubble.text, color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp)
                }
            }
        }
    }
}

@Composable
private fun ComposerBar(vm: DshViewModel) {
    val p = dsh()
    val pending = vm.pendingApproval
    Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (pending != null) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .shadow(8.dp, RoundedCornerShape(20.dp))
                    .clip(RoundedCornerShape(20.dp))
                    .border(1.dp, p.warnSecondary, RoundedCornerShape(20.dp))
                    .background(p.inputMajor),
            ) {
                Row(
                    Modifier.fillMaxWidth().background(p.warnTertiary).padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(p.warn))
                    Spacer(Modifier.width(8.dp))
                    Text("等待审批", color = p.warn, fontSize = 13.sp, lineHeight = 18.sp)
                }
                Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(pending.title, color = p.labelPrimary, fontSize = 15.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium)
                    if (pending.command.isNotEmpty()) {
                        Text(
                            pending.command,
                            color = p.labelTertiary,
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                            fontFamily = FontFamily.Monospace,
                        )
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    DshGhostButton("拒绝", fill = false, onClick = { vm.answer("rejected") })
                    DshPrimaryButton("允许一次", fill = false, onClick = { vm.answer("allowed-once") })
                }
            }
            return
        }
        Column(
            Modifier
                .fillMaxWidth()
                .shadow(4.dp, ComposerShape)
                .clip(ComposerShape)
                .border(1.dp, p.borderHair, ComposerShape)
                .background(p.inputMajor)
                .padding(top = 10.dp, bottom = 6.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (vm.attachments.isNotEmpty()) {
                LazyRow(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    itemsIndexed(vm.attachments) { index, img ->
                        val bmp = BitmapFactory.decodeByteArray(img.bytes, 0, img.bytes.size)
                        if (bmp != null) {
                            Box(Modifier.size(64.dp)) {
                                Image(
                                    bmp.asImageBitmap(),
                                    null,
                                    Modifier
                                        .fillMaxSize()
                                        .clip(RoundedCornerShape(16.dp))
                                        .border(1.dp, p.borderHair, RoundedCornerShape(16.dp))
                                        .then(dshClickable { vm.lightbox = img }),
                                    contentScale = ContentScale.Crop,
                                )
                                Box(
                                    Modifier
                                        .align(Alignment.TopEnd)
                                        .padding(4.dp)
                                        .size(18.dp)
                                        .clip(CircleShape)
                                        .background(p.buttonPrimaryFill)
                                        .then(dshClickable { vm.removeAttachment(index) }),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(DshIcons.Close, null, Modifier.size(10.dp), p.labelPrimaryForeground)
                                }
                            }
                        }
                    }
                }
            }
            DshDraftField(value = vm.draft, onValueChange = { vm.draft = it }, placeholder = "给智能体发消息")
            Row(
                Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, bottom = 0.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconHit(DshIcons.Plus, p.labelSecondary, onClick = {
                        vm.gitDialog = ""
                        vm.attachOpen = !vm.attachOpen
                    }, shape = Menu)
                    ModeChip(vm.accessMode) {
                        vm.attachOpen = false
                        vm.settingsOpen = true
                        vm.settingsPane = "权限"
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ModeChip("模型") {
                        vm.attachOpen = false
                        vm.settingsOpen = true
                        vm.settingsPane = "模型"
                    }
                    if (vm.running) {
                        Box(
                            Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(p.buttonPrimaryFill)
                                .then(dshClickable { vm.cancelRun() }),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(DshIcons.Stop, null, Modifier.size(12.dp), p.labelPrimaryForeground)
                        }
                    } else {
                        val canSend = vm.draft.isNotBlank() || vm.attachments.isNotEmpty()
                        Box(
                            Modifier
                                .size(34.dp)
                                .alpha(if (canSend) 1f else 0.45f)
                                .clip(CircleShape)
                                .background(p.buttonInfoFill)
                                .then(dshClickable(enabled = canSend) { vm.send() }),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(DshIcons.Send, null, Modifier.size(16.dp), Color.White)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ModeChip(label: String, onClick: () -> Unit) {
    val p = dsh()
    Row(
        Modifier
            .height(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .then(dshClickable(onClick = onClick))
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(label, color = p.labelSecondary, fontSize = 13.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
        Icon(DshIcons.ChevronDown, null, Modifier.size(12.dp), p.labelSecondary)
    }
}

@Composable
private fun AttachSheet(vm: DshViewModel, onPickCamera: () -> Unit, onPickGallery: () -> Unit) {
    BottomSheet(visible = vm.attachOpen, title = "添加", onDismiss = { vm.attachOpen = false }) {
        SheetItem("拍照") { vm.attachOpen = false; onPickCamera() }
        SheetItem("从相册选择") { vm.attachOpen = false; onPickGallery() }
        SheetItem("从工作区选文件") {
            vm.attachOpen = false
            vm.settingsOpen = true
            vm.settingsPane = "文件"
            vm.loadFiles()
        }
    }
}

@Composable
private fun GitLayers(vm: DshViewModel) {
    val p = dsh()
    val sheet = vm.gitDialog == "menu" || vm.gitDialog == "branch"
    val modal = vm.gitDialog == "commit" || vm.gitDialog == "create-branch" || vm.gitDialog == "confirm"
    BottomSheet(visible = sheet && vm.gitDialog == "menu", title = "Git 操作", onDismiss = { vm.gitDialog = "" }) {
        val quick = vm.gitQuick
        val hasOpenPr = vm.gitStatus.pr?.state == "open"
        SheetItem("Fetch", enabled = !vm.gitBusy) { vm.gitAction("gitFetchForStatus") }
        SheetItem("Pull", enabled = !vm.gitBusy) { vm.gitAction("gitPull") }
        SheetItem(
            "Commit",
            enabled = !vm.gitBusy && vm.gitStatus.hasWorkingTreeChanges,
            hint = if (vm.gitStatus.hasWorkingTreeChanges) "" else "工作区是干净的。请先改文件再提交。",
            icon = DshIcons.Commit,
        ) { vm.gitDialog = "commit" }
        SheetItem(
            "Push",
            enabled = !vm.gitBusy && vm.gitStatus.aheadCount > 0 && !vm.gitStatus.hasWorkingTreeChanges && vm.gitStatus.behindCount == 0,
            hint = if (vm.gitStatus.hasWorkingTreeChanges) "请先提交或贮藏本地改动再推送。" else "",
            icon = DshIcons.Push,
        ) { vm.maybeConfirm("gitPush") }
        SheetItem(
            if (hasOpenPr) "View PR" else "Create PR",
            enabled = !vm.gitBusy && (hasOpenPr || (vm.gitStatus.aheadCount > 0 && !vm.gitStatus.hasWorkingTreeChanges)),
            icon = DshIcons.PullRequest,
        ) {
            if (hasOpenPr) {
                vm.gitDialog = ""
                vm.banner = "已在电脑上打开拉取请求"
                vm.gitToast = "打开拉取请求"
            } else {
                vm.maybeConfirm("gitCreateChangeRequest")
            }
        }
        if (quick.kind == "show_hint" && quick.hint.isNotEmpty()) {
            Text(quick.hint, color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
        }
    }
    BottomSheet(visible = sheet && vm.gitDialog == "branch", title = "切换分支", onDismiss = { vm.gitDialog = "" }) {
        DshField(vm.branchQuery, { vm.branchQuery = it }, "搜索分支…", modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp))
        val q = vm.branchQuery.trim()
        val rows = vm.branches.filter { q.isEmpty() || it.name.contains(q, ignoreCase = true) }
        if (rows.isEmpty()) {
            Text("没有匹配的分支", color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
        }
        rows.forEach { branch ->
            val current = branch.isCurrent && !branch.isRemote
            SheetItem(
                branch.name,
                enabled = !current,
                hint = when {
                    branch.isRemote -> "远程"
                    current -> "当前"
                    else -> ""
                },
                icon = DshIcons.Branch,
            ) { vm.switchBranch(if (branch.isRemote) branch.name.removePrefix("origin/") else branch.name) }
        }
        val canCreate = q.isNotEmpty() && vm.branches.none { it.name == q && !it.isRemote }
        SheetItem(
            if (canCreate) "创建并检出分支「$q」" else "创建并检出新分支…",
            icon = DshIcons.Plus,
        ) {
            if (canCreate) vm.newBranchName = q
            vm.gitDialog = "create-branch"
        }
    }
    AnimatedVisibility(
        visible = modal,
        modifier = Modifier.fillMaxSize().zIndex(33f),
        enter = overlayEnter(),
        exit = overlayExit(),
    ) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().background(p.mask).then(dshClickable(ripple = false) { vm.gitDialog = ""; vm.gitConfirmAction = "" }))
            when (vm.gitDialog) {
                "commit" -> GitDialog(
                    compact = false,
                    title = "提交更改",
                    lead = "确认本次提交内容。提交信息留空将自动生成。",
                    foot = {
                        DshGhostButton("取消", fill = false, onClick = { vm.gitDialog = "" })
                        DshGhostButton("在新建分支上提交", fill = false, onClick = { vm.gitDialog = "create-branch" })
                        DshPrimaryButton("提交", fill = false, onClick = {
                            vm.gitAction("gitCommit", buildJsonObject { put("message", vm.commitMessage) })
                        })
                    },
                ) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .border(1.dp, p.borderL2, Menu)
                            .clip(Menu)
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("分支", color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
                            Spacer(Modifier.width(8.dp))
                            Text(vm.gitStatus.refName ?: "—", color = p.labelPrimary, fontSize = 13.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            if (vm.gitStatus.isDefaultRef) {
                                Text("警告：目标为默认分支", color = p.warn, fontSize = 12.sp, lineHeight = 18.sp)
                            }
                        }
                        Text(
                            if (vm.gitStatus.hasWorkingTreeChanges) "有未提交更改" else "无",
                            color = p.labelTertiary,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                        )
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("提交信息（可选）", color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
                        DshField(vm.commitMessage, { vm.commitMessage = it }, "留空则自动生成")
                    }
                }
                "create-branch" -> GitDialog(
                    compact = true,
                    title = "创建并检出新分支",
                    lead = "基于当前 HEAD 创建一个新的本地分支，并在创建成功后立即切换过去。",
                    foot = {
                        DshGhostButton("取消", onClick = { vm.gitDialog = "" })
                        DshPrimaryButton("Create branch", enabled = vm.newBranchName.trim().isNotEmpty(), onClick = { vm.createBranch() })
                    },
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("分支名", color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
                        DshField(vm.newBranchName, { vm.newBranchName = it }, "例如 feature/git-branch-switcher")
                    }
                }
                else -> GitDialog(
                    compact = true,
                    title = if (vm.gitConfirmAction == "gitCreateChangeRequest") "从默认分支推送并创建 pull request？" else "推送到默认分支？",
                    lead = "此操作会作用在“${vm.gitStatus.refName ?: ""}”。你可以继续在此引用上操作，或新建功能引用后再执行同一操作。",
                    foot = {
                        DshGhostButton("取消", onClick = { vm.gitDialog = ""; vm.gitConfirmAction = "" })
                        DshGhostButton("新建功能分支", onClick = { vm.gitDialog = "create-branch" })
                        DshPrimaryButton(
                            if (vm.gitConfirmAction == "gitCreateChangeRequest") "推送并创建 pull request" else "推送到 ${vm.gitStatus.refName ?: ""}",
                            onClick = { vm.confirmDefaultGit() },
                        )
                    },
                ) { }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GitDialog(
    compact: Boolean,
    title: String,
    lead: String,
    foot: @Composable () -> Unit,
    body: @Composable () -> Unit,
) {
    val p = dsh()
    val shape = Dialog
    BoxWithConstraints(
        Modifier.fillMaxSize().padding(12.dp),
        contentAlignment = if (compact) Alignment.BottomCenter else Alignment.Center,
    ) {
        val heightMod = if (compact) Modifier.heightIn(max = maxHeight * 0.7f) else Modifier.fillMaxSize()
        Column(
            heightMod
                .fillMaxWidth()
                .shadow(12.dp, shape)
                .clip(shape)
                .background(p.bgLayer1),
        ) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)) {
                Text(title, color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
                Text(lead, color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
            }
            if (compact) {
                Column(
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) { body() }
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) { foot() }
            } else {
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) { body() }
                FlowRow(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) { foot() }
            }
        }
    }
}

@Composable
private fun GitToast(vm: DshViewModel) {
    val p = dsh()
    val visible = vm.gitBusy || vm.gitToast.isNotEmpty()
    AnimatedVisibility(
        visible = visible,
        modifier = Modifier.fillMaxWidth().zIndex(32f).padding(horizontal = 12.dp, vertical = 8.dp),
        enter = popoverEnter(),
        exit = popoverExit(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .shadow(4.dp, Menu)
                .clip(Menu)
                .border(1.dp, p.borderL2, Menu)
                .background(p.bgLayer2)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (vm.gitBusy) {
                CircularProgressIndicator(Modifier.size(16.dp).padding(top = 2.dp), color = p.labelPrimary, strokeWidth = 2.dp)
            } else {
                Text(if (vm.gitToast.contains("失败") || vm.gitToast.contains("不可用")) "!" else "✓", color = if (vm.gitToast.contains("失败") || vm.gitToast.contains("不可用")) p.error else p.success, fontSize = 13.sp)
            }
            Column(Modifier.weight(1f)) {
                Text(
                    when {
                        vm.gitBusy -> "Git 操作进行中"
                        else -> vm.gitToast.ifEmpty { "完成" }
                    },
                    color = p.labelPrimary,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                )
                if (vm.gitStatus.refName != null && !vm.gitBusy) {
                    Text(vm.gitStatus.refName ?: "", color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
                }
            }
            IconHit(DshIcons.Close, p.labelPrimary, onClick = { vm.gitToast = "" })
        }
    }
}

@Composable
private fun Drawer(vm: DshViewModel, modifier: Modifier = Modifier) {
    val p = dsh()
    Column(
        modifier
            .background(p.sidebarFill)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 8.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconHit(
                DshIcons.Menu,
                p.labelPrimary,
                onClick = { vm.closeDrawer() },
                modifier = Modifier.background(p.buttonFloating, Menu),
                shape = Menu,
            )
            DshField(vm.query, { vm.query = it }, "搜索会话", modifier = Modifier.weight(1f), radius = 12.dp)
        }
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(38.dp)
                .clip(Menu)
                .border(1.dp, p.borderL2, Menu)
                .background(p.buttonElevated)
                .then(dshClickable { vm.newSession() }),
            contentAlignment = Alignment.Center,
        ) {
            Text("新会话", color = p.labelPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 22.sp)
        }
        Text(vm.hostName, color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        LazyColumn(Modifier.weight(1f)) {
            items(vm.filteredSessions(), key = { it.sessionId }) { row ->
                val active = row.sessionId == vm.sessionId
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(Menu)
                        .background(if (active) p.navActive else Color.Transparent)
                        .then(dshClickable { vm.selectSession(row.sessionId) })
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(vm.titleFor(row), color = p.labelPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Normal)
                    if (row.running) Text("运行中", color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
                }
            }
        }
        DrawerFoot(DshIcons.Branch, "工作区") {
            vm.closeDrawer()
            vm.settingsOpen = true
            vm.workspaceOpen = true
            vm.settingsPane = "工作区"
            vm.refreshGit()
            vm.loadFiles()
        }
        DrawerFoot(DshIcons.Gear, "设置") {
            vm.closeDrawer()
            vm.settingsOpen = true
            vm.settingsPane = ""
        }
    }
}

@Composable
private fun SettingsOverlay(vm: DshViewModel) {
    val p = dsh()
    Column(Modifier.fillMaxSize().background(p.bgLayer2).windowInsetsPadding(WindowInsets.safeDrawing)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 8.dp, end = 14.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (vm.settingsPane.isNotEmpty()) {
                IconHit(DshIcons.Back, p.labelPrimary, onClick = { vm.settingsPane = "" })
            }
            Text(
                vm.settingsPane.ifEmpty { "设置" },
                Modifier.weight(1f),
                color = p.labelPrimary,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Medium,
            )
            IconHit(DshIcons.Close, p.labelPrimary, onClick = { vm.settingsOpen = false; vm.settingsPane = "" })
        }
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(if (vm.settingsPane == "工作区") 12.dp else 20.dp),
        ) {
            when (vm.settingsPane) {
                "" -> SettingsHub(vm)
                "外观" -> PhoneAppearance(vm)
                "工作区" -> WorkspacePane(vm)
                "文件" -> FilesPane(vm)
                "电脑外观" -> HostAppearance(vm)
                "界面设置" -> HostChrome(vm)
                "连接详情" -> ConnectDetail(vm)
                "权限" -> AccessPane(vm)
                "模型" -> HostRequestPane(vm)
                else -> HostRequestPane(vm)
            }
        }
    }
}

@Composable
private fun SettingsHub(vm: DshViewModel) {
    Notice("远程页上的改动只留在这次连接，不会写回电脑上的 settings.yaml。标了「电脑」的项会改 Host 窗口。")
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Column {
            GroupLabel("这次连接")
            Group {
                LinkRow("连接详情", vm.channelLabel()) { vm.settingsPane = "连接详情" }
                LinkRow("断开这台设备", "作废本机设备令牌", chevron = false, danger = true, showDivider = false) { vm.unbind() }
            }
        }
        Column {
            GroupLabel("对话")
            Group {
                LinkRow("通用设置", "语言 · 排队") { vm.settingsPane = "通用设置" }
                LinkRow("权限", vm.accessMode) { vm.settingsPane = "权限" }
                LinkRow("模型", "当前会话", showDivider = false) { vm.settingsPane = "模型" }
            }
        }
        Column {
            GroupLabel("工作区")
            Group {
                LinkRow("工作区", vm.gitStatusLine()) { vm.settingsPane = "工作区"; vm.refreshGit() }
                LinkRow("文件", "搜索并插入到输入框", showDivider = false) { vm.settingsPane = "文件"; vm.loadFiles() }
            }
        }
        Column {
            GroupLabel("这台手机")
            Group { LinkRow("外观", schemeLabel(vm.scheme), showDivider = false) { vm.settingsPane = "外观" } }
        }
        Column {
            GroupLabel("电脑与界面")
            Group {
                LinkRow("电脑外观", "背景图 · 毛玻璃") { vm.settingsPane = "电脑外观" }
                LinkRow("界面设置", "标题栏 Git · 分栏 · 日志", showDivider = false) { vm.settingsPane = "界面设置" }
            }
        }
        Column {
            GroupLabel("Host")
            Group {
                LinkRow("MCP", "在电脑上打开") { vm.settingsPane = "MCP" }
                LinkRow("技能", "在电脑上打开") { vm.settingsPane = "技能" }
                LinkRow("插件", "已挂载清单") { vm.settingsPane = "插件" }
                LinkRow("市场", "在电脑上安装", showDivider = false) { vm.settingsPane = "市场" }
            }
        }
        Column {
            GroupLabel("关于")
            Group { LinkRow("关于", "Deepseek-Harness-Desktop", showDivider = false) { vm.settingsPane = "关于" } }
        }
    }
}

@Composable
private fun PhoneAppearance(vm: DshViewModel) {
    val p = dsh()
    Text("只改这台手机。电脑窗口的色制和背景图在「电脑外观」。", color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("色制", color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
        Text("这台手机用浅色、深色，还是跟随系统。", color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("light" to "浅色", "dark" to "深色", "system" to "跟随系统").forEach { (id, label) ->
                val on = vm.scheme == id
                Box(
                    Modifier
                        .weight(1f)
                        .height(64.dp)
                        .clip(Menu)
                        .border(1.dp, if (on) p.buttonInfoFill else p.borderL2, Menu)
                        .background(if (on) p.navActive else p.bgLayer1)
                        .then(dshClickable { vm.persistScheme(id) })
                        .padding(8.dp),
                    contentAlignment = Alignment.BottomStart,
                ) {
                    Text(label, color = p.labelPrimary, fontSize = 12.sp, lineHeight = 18.sp)
                }
            }
        }
        Text("主题", color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
        Row(
            Modifier
                .fillMaxWidth()
                .height(48.dp)
                .clip(Menu)
                .border(1.dp, p.borderL2, Menu)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("DeepSeek", color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp)
            Box(Modifier.size(16.dp).clip(RoundedCornerShape(8.dp)).background(p.buttonInfoFill))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("玻璃透明度", color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
            Text("${vm.glass}%", color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp)
        }
        Text("这台手机的毛玻璃。数值越低越通透。不改电脑窗口。", color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp)
        Slider(
            value = vm.glass.toFloat(),
            onValueChange = { vm.persistGlass(it.toInt()) },
            valueRange = 0f..100f,
            colors = SliderDefaults.colors(
                thumbColor = Color.White,
                activeTrackColor = p.buttonPrimaryFill,
                inactiveTrackColor = p.borderL2,
                activeTickColor = Color.Transparent,
                inactiveTickColor = Color.Transparent,
            ),
        )
        Text("字体", color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
        HairRow("界面字体", "留空则用系统默认。只作用于这台手机。")
        DshField(vm.uiFont, { vm.persistFont(it) }, "系统默认")
    }
}

@Composable
private fun HostAppearance(vm: DshViewModel) {
    Notice("图库窗口在电脑上。这里可以请电脑打开外观。")
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("背景图", color = dsh().labelPrimary, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
        DshGhostButton("在电脑上打开图库") { vm.requestHost("openGallery") }
        DshGhostButton("在电脑上打开外观") { vm.requestHost("openSettings", buildJsonObject { put("sectionId", "appearance") }) }
    }
}

@Composable
private fun HostChrome(vm: DshViewModel) {
    SwitchRow("标题栏 Git 操作", "电脑宽屏标题栏和手机对话页头显示分支胶囊。工作区顶部的 Git 操作始终可用。", vm.gitTitle) {
        vm.persistGitTitle(!vm.gitTitle)
    }
    Spacer(Modifier.height(12.dp))
    DshGhostButton("在电脑上打开界面设置") { vm.requestHost("openSettings") }
}

@Composable
private fun ConnectDetail(vm: DshViewModel) {
    Notice("远程页上的改动只留在这次连接，不会写回电脑上的 settings.yaml。标了「电脑」的项会改 Host 窗口。")
    HairRow("主机", vm.hostName)
    HairRow("通道", vm.channelLabel())
    Spacer(Modifier.height(12.dp))
    DshDangerButton("断开这台设备") { vm.unbind() }
}

@Composable
private fun AccessPane(vm: DshViewModel) {
    HairRow("默认访问模式", "新会话的工具权限。完全访问仍要确认。", trailing = {
        SelectorChip(vm.accessMode) {
            vm.accessMode = if (vm.accessMode == "只读") "完全访问" else "只读"
        }
    })
}

@Composable
private fun HostRequestPane(vm: DshViewModel) {
    val p = dsh()
    val section = when (vm.settingsPane) {
        "MCP" -> "mcp"
        "技能" -> "skills"
        "插件" -> "plugins"
        "市场" -> "market"
        else -> ""
    }
    Text("这些项在电脑 Host 上。手机只发送打开请求，不画假清单。", color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
    Spacer(Modifier.height(12.dp))
    if (section.isNotEmpty()) {
        DshPrimaryButton("在电脑上打开${vm.settingsPane}") {
            vm.requestHost("openSettings", buildJsonObject { put("sectionId", section) })
        }
    } else {
        Text("会话内选项只留在这次连接。电脑窗口关闭行为请在电脑设置里改。", color = p.labelSecondary, fontSize = 14.sp, lineHeight = 22.sp)
        Spacer(Modifier.height(8.dp))
        DshGhostButton("在电脑上打开设置") { vm.requestHost("openSettings") }
    }
}

@Composable
private fun WorkspacePane(vm: DshViewModel) {
    val p = dsh()
    val quick = vm.gitQuick
    GitCapsule(vm, quick)
    Text(vm.gitStatusLine(), color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
    Row(Modifier.fillMaxWidth().clip(Menu).background(p.bgModule).padding(2.dp)) {
        Tab("更改", vm.wsTab == "changes", Modifier.weight(1f)) { vm.wsTab = "changes" }
        Tab("文件", vm.wsTab == "files", Modifier.weight(1f)) { vm.wsTab = "files"; vm.loadFiles() }
    }
    if (vm.wsTab == "files") {
        FilesPane(vm)
    } else {
        Text(
            if (vm.gitStatus.hasWorkingTreeChanges) "有未提交更改。用顶部胶囊提交，或到文件 Tab 插入路径。" else "工作区是干净的。",
            color = p.labelSecondary,
            fontSize = 12.sp,
            lineHeight = 18.sp,
        )
    }
}

@Composable
private fun GitCapsule(vm: DshViewModel, quick: GitQuick) {
    val p = dsh()
    Row(
        Modifier
            .fillMaxWidth()
            .height(32.dp)
            .clip(Capsule)
            .border(1.dp, p.borderL2, Capsule),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .then(dshClickable(enabled = !vm.gitBusy) {
                    vm.branchQuery = ""
                    vm.loadBranches()
                })
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(DshIcons.Branch, null, Modifier.size(14.dp), p.labelPrimary)
            Text(
                vm.gitStatus.refName ?: "—",
                color = p.labelPrimary,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Icon(DshIcons.ChevronDown, null, Modifier.size(14.dp), p.labelPrimary)
        }
        Box(Modifier.width(1.dp).fillMaxHeight().padding(vertical = 6.dp).background(p.borderL2))
        Row(
            Modifier
                .widthIn(max = 180.dp)
                .fillMaxHeight()
                .then(dshClickable(enabled = !quick.disabled && !vm.gitBusy) { vm.runGitPrimary() })
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(primaryGitIcon(quick), null, Modifier.size(14.dp), if (quick.disabled) p.labelCaption else p.labelPrimary)
            Text(
                quick.label,
                color = if (quick.disabled) p.labelCaption else p.labelPrimary,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Box(Modifier.width(1.dp).fillMaxHeight().padding(vertical = 6.dp).background(p.borderL2))
        Box(
            Modifier.width(28.dp).fillMaxHeight().then(dshClickable(enabled = !vm.gitBusy) { vm.gitDialog = "menu" }),
            contentAlignment = Alignment.Center,
        ) {
            Icon(DshIcons.ChevronDown, null, Modifier.size(16.dp), p.labelPrimary)
        }
    }
}

private fun primaryGitIcon(quick: GitQuick): ImageVector {
    return when {
        quick.kind == "open_pr" || quick.label.contains("PR") -> DshIcons.PullRequest
        quick.action == "commit" || quick.label == "Commit" -> DshIcons.Commit
        else -> DshIcons.Push
    }
}

@Composable
private fun FilesPane(vm: DshViewModel) {
    val p = dsh()
    DshField(vm.fileQuery, { vm.fileQuery = it }, "搜索文件", radius = 12.dp)
    val q = vm.fileQuery.trim()
    val rows = vm.fileEntries.filter { q.isEmpty() || it.contains(q) }
    if (rows.isEmpty()) {
        Text("没有匹配的文件", color = p.labelSecondary, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(vertical = 12.dp))
    }
    rows.forEach { path ->
        val name = path.trimEnd('/').substringAfterLast('/')
        Row(
            Modifier
                .fillMaxWidth()
                .then(dshClickable { vm.insertMention(path.trimEnd('/')) })
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(name.ifEmpty { path }, color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(path, color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        HorizontalDivider(color = p.borderL1, thickness = 1.dp)
    }
}

@Composable
private fun Tab(label: String, on: Boolean, modifier: Modifier = Modifier, click: () -> Unit) {
    val p = dsh()
    Box(
        modifier
            .height(32.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (on) p.bgLayer1 else Color.Transparent)
            .then(dshClickable(onClick = click)),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = p.labelPrimary, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 20.sp)
    }
}

@Composable
private fun Notice(text: String) {
    val p = dsh()
    Text(
        text,
        color = p.labelSecondary,
        fontSize = 12.sp,
        lineHeight = 18.sp,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(p.interactiveHover)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}

@Composable
private fun GroupLabel(text: String) {
    Text(text, color = dsh().labelTertiary, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
}

@Composable
private fun Group(content: @Composable () -> Unit) {
    Column(Modifier.clip(Menu).background(dsh().bgLayer1)) { content() }
}

@Composable
private fun LinkRow(
    title: String,
    desc: String,
    chevron: Boolean = true,
    danger: Boolean = false,
    showDivider: Boolean = true,
    onClick: () -> Unit,
) {
    val p = dsh()
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .then(dshClickable(onClick = onClick))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = if (danger) p.error else p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp)
                Text(desc, color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
            }
            if (chevron) Icon(DshIcons.Chevron, null, Modifier.size(16.dp), p.labelCaption)
        }
        if (showDivider) HorizontalDivider(color = p.borderL1, thickness = 1.dp)
    }
}

@Composable
private fun HairRow(title: String, desc: String, trailing: (@Composable () -> Unit)? = null) {
    val p = dsh()
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp)
            Text(desc, color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
        }
        trailing?.invoke()
    }
    HorizontalDivider(color = p.borderL2, thickness = 1.dp)
}

@Composable
private fun SwitchRow(title: String, desc: String, on: Boolean, onToggle: () -> Unit) {
    val p = dsh()
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp)
            Text(desc, color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
        }
        DshSwitch(on, onToggle)
    }
    HorizontalDivider(color = p.borderL1, thickness = 1.dp)
}

@Composable
private fun DshSwitch(on: Boolean, onToggle: () -> Unit) {
    val p = dsh()
    val reduce = reduceMotion()
    val x by animateDpAsState(
        targetValue = if (on) 16.dp else 2.dp,
        animationSpec = tween(if (reduce) 0 else 100, easing = FastOutSlowInEasing),
        label = "switch",
    )
    Box(
        Modifier
            .size(width = 40.dp, height = 24.dp)
            .clip(Capsule)
            .border(1.dp, if (on) Color.Transparent else p.borderL2, Capsule)
            .background(if (on) p.buttonPrimaryFill else p.bgModule)
            .then(dshClickable(onClick = onToggle)),
    ) {
        Box(
            Modifier
                .offset(x = x, y = 2.dp)
                .size(18.dp)
                .clip(CircleShape)
                .background(if (on) p.labelPrimaryForeground else Color.White),
        )
    }
}

@Composable
private fun SelectorChip(label: String, onClick: () -> Unit) {
    val p = dsh()
    Row(
        Modifier
            .height(36.dp)
            .clip(Capsule)
            .background(p.bgModule)
            .then(dshClickable(onClick = onClick))
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(label, color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp)
        Icon(DshIcons.ChevronDown, null, Modifier.size(12.dp), p.labelPrimary)
    }
}

@Composable
private fun DrawerFoot(icon: ImageVector, label: String, onClick: () -> Unit) {
    val p = dsh()
    Row(
        Modifier
            .fillMaxWidth()
            .height(42.dp)
            .clip(Menu)
            .then(dshClickable(onClick = onClick))
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(16.dp), p.labelPrimary)
        Spacer(Modifier.width(8.dp))
        Text(label, color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp)
    }
}

@Composable
private fun BottomSheet(visible: Boolean, title: String, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val p = dsh()
    AnimatedVisibility(
        visible = visible,
        modifier = Modifier.fillMaxSize().zIndex(31f),
        enter = popoverEnter(),
        exit = popoverExit(),
    ) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().background(p.mask).then(dshClickable(ripple = false, onClick = onDismiss)))
            Column(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(12.dp)
                    .shadow(12.dp, Dialog)
                    .clip(Dialog)
                    .background(p.bgLayer1)
                    .padding(8.dp),
            ) {
                Text(title, color = p.labelTertiary, fontSize = 13.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                content()
            }
        }
    }
}

@Composable
private fun SheetItem(
    label: String,
    enabled: Boolean = true,
    hint: String = "",
    icon: ImageVector? = null,
    onClick: () -> Unit,
) {
    val p = dsh()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(Menu)
            .then(dshClickable(enabled = enabled, onClick = onClick))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) Icon(icon, null, Modifier.size(16.dp), if (enabled) p.labelPrimary else p.labelCaption)
        Column(Modifier.weight(1f)) {
            Text(label, color = if (enabled) p.labelPrimary else p.labelCaption, fontSize = 14.sp, lineHeight = 22.sp)
            if (hint.isNotEmpty()) Text(hint, color = p.labelTertiary, fontSize = 12.sp, lineHeight = 18.sp)
        }
    }
}

@Composable
private fun DshPrimaryButton(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    fill: Boolean = true,
    onClick: () -> Unit,
) {
    val p = dsh()
    Box(
        modifier
            .then(if (fill) Modifier.fillMaxWidth() else Modifier)
            .height(36.dp)
            .alpha(if (enabled) 1f else 0.45f)
            .clip(Capsule)
            .background(p.buttonPrimaryFill)
            .then(dshClickable(enabled = enabled, onClick = onClick))
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = p.labelPrimaryForeground, fontSize = 14.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

@Composable
private fun DshGhostButton(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    fill: Boolean = true,
    onClick: () -> Unit,
) {
    val p = dsh()
    Box(
        modifier
            .then(if (fill) Modifier.fillMaxWidth() else Modifier)
            .height(36.dp)
            .alpha(if (enabled) 1f else 0.45f)
            .clip(Capsule)
            .border(1.dp, p.borderL2, Capsule)
            .then(dshClickable(enabled = enabled, onClick = onClick))
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

@Composable
private fun DshDangerButton(label: String, onClick: () -> Unit) {
    val p = dsh()
    Box(
        Modifier
            .fillMaxWidth()
            .height(36.dp)
            .clip(Capsule)
            .then(dshClickable(onClick = onClick)),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = p.error, fontSize = 14.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun DshField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    radius: androidx.compose.ui.unit.Dp = 8.dp,
) {
    val p = dsh()
    val shape = RoundedCornerShape(radius)
    Box(
        modifier
            .fillMaxWidth()
            .height(36.dp)
            .clip(shape)
            .border(1.dp, p.borderL2, shape)
            .background(p.bgLayer1)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) Text(placeholder, color = p.labelCaption, fontSize = 14.sp, lineHeight = 22.sp)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(color = p.labelPrimary, fontSize = 14.sp, lineHeight = 22.sp),
            cursorBrush = SolidColor(p.labelPrimary),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun DshDraftField(value: String, onValueChange: (String) -> Unit, placeholder: String) {
    val p = dsh()
    Box(Modifier.fillMaxWidth().heightIn(min = 48.dp, max = 120.dp).padding(horizontal = 16.dp)) {
        if (value.isEmpty()) Text(placeholder, color = p.labelCaption, fontSize = 16.sp, lineHeight = 24.sp)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = TextStyle(color = p.labelPrimary, fontSize = 16.sp, lineHeight = 24.sp),
            cursorBrush = SolidColor(p.labelPrimary),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun IconHit(
    vector: ImageVector,
    tint: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = IconBtn,
) {
    Box(
        modifier
            .size(36.dp)
            .clip(shape)
            .then(dshClickable(onClick = onClick)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(vector, null, Modifier.size(16.dp), tint)
    }
}

private fun schemeLabel(scheme: String) = when (scheme) {
    "dark" -> "深色"
    "light" -> "浅色"
    else -> "跟随系统"
}
