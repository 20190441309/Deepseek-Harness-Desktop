package ai.deepseek.harness.mobile.ui

import android.annotation.SuppressLint
import android.util.Size
import androidx.camera.core.CameraControl
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

@SuppressLint("UnsafeOptInUsageError")
@Composable
fun ScanScreen(onFound: (String) -> Unit, onClose: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context) }
    val done = remember { AtomicBoolean(false) }
    val control = remember { AtomicReference<CameraControl?>(null) }
    var torch by remember { mutableStateOf(false) }
    DisposableEffect(owner) {
        val executor = Executors.newSingleThreadExecutor()
        val scanner = BarcodeScanning.getClient()
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val cameraProvider = future.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setTargetResolution(Size(1280, 720))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(executor) { proxy ->
                val media = proxy.image
                if (media != null && !done.get()) {
                    val image = InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees)
                    scanner.process(image)
                        .addOnSuccessListener { codes ->
                            val raw = codes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }?.rawValue
                            if (!raw.isNullOrEmpty() && done.compareAndSet(false, true)) onFound(raw)
                        }
                        .addOnCompleteListener { proxy.close() }
                } else {
                    proxy.close()
                }
            }
            cameraProvider.unbindAll()
            val camera = cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            control.set(camera.cameraControl)
        }, ContextCompat.getMainExecutor(context))
        onDispose {
            executor.shutdown()
            scanner.close()
            control.set(null)
            try {
                ProcessCameraProvider.getInstance(context).get().unbindAll()
            } catch (_: Exception) {
                // Camera provider may not be ready yet.
            }
        }
    }
    androidx.activity.compose.BackHandler(onBack = onClose)
    val ink = Color(249, 250, 251)
    val inkMuted = Color(173, 178, 184)
    Column(
        Modifier
            .fillMaxSize()
            .background(Color(21, 21, 23))
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(bottom = 12.dp),
    ) {
        Box(
            Modifier
                .weight(1f)
                .padding(start = 24.dp, end = 24.dp, top = 16.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(27, 27, 28)),
        ) {
            AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
            if (torch) {
                Box(Modifier.fillMaxSize().background(Color(255, 255, 220, 0x28)))
            }
            Canvas(Modifier.fillMaxSize()) {
                val insetX = size.width * 0.18f
                val insetY = size.height * 0.18f
                val arm = 28.dp.toPx()
                val stroke = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Square)
                val left = insetX
                val top = insetY
                val right = size.width - insetX
                val bottom = size.height - insetY
                drawLine(ink, Offset(left, top), Offset(left + arm, top), stroke.width, StrokeCap.Square)
                drawLine(ink, Offset(left, top), Offset(left, top + arm), stroke.width, StrokeCap.Square)
                drawLine(ink, Offset(right, top), Offset(right - arm, top), stroke.width, StrokeCap.Square)
                drawLine(ink, Offset(right, top), Offset(right, top + arm), stroke.width, StrokeCap.Square)
                drawLine(ink, Offset(left, bottom), Offset(left + arm, bottom), stroke.width, StrokeCap.Square)
                drawLine(ink, Offset(left, bottom), Offset(left, bottom - arm), stroke.width, StrokeCap.Square)
                drawLine(ink, Offset(right, bottom), Offset(right - arm, bottom), stroke.width, StrokeCap.Square)
                drawLine(ink, Offset(right, bottom), Offset(right, bottom - arm), stroke.width, StrokeCap.Square)
            }
        }
        Text(
            "将二维码放入框内",
            color = inkMuted,
            fontSize = 13.sp,
            lineHeight = 20.sp,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier
                    .weight(1f)
                    .height(36.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .border(1.dp, Color(255, 255, 255, 0x29), RoundedCornerShape(18.dp))
                    .then(dshClickable(onClick = onClose)),
                contentAlignment = Alignment.Center,
            ) {
                Text("取消", color = ink, fontSize = 14.sp, lineHeight = 22.sp)
            }
            Box(
                Modifier
                    .weight(1f)
                    .height(36.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(if (torch) ink else Color(249, 250, 251))
                    .then(
                        dshClickable {
                            torch = !torch
                            control.get()?.enableTorch(torch)
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (torch) "关闭手电" else "手电筒",
                    color = Color(15, 17, 21),
                    fontSize = 14.sp,
                    lineHeight = 22.sp,
                )
            }
        }
    }
}
