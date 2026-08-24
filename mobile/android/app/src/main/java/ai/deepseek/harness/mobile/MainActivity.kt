package ai.deepseek.harness.mobile

import ai.deepseek.harness.mobile.store.EncryptedDeviceStore
import ai.deepseek.harness.mobile.ui.DshRoot
import ai.deepseek.harness.mobile.ui.ScanScreen
import ai.deepseek.harness.mobile.ui.theme.DshTheme
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

class MainActivity : ComponentActivity() {
    private val store by lazy { EncryptedDeviceStore(applicationContext) }
    private val vm: DshViewModel by viewModels { DshVmFactory(store) }

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        vm.route = if (granted) Route.Scan else Route.Permission
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            val dark = when (vm.scheme) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }
            DisposableEffect(dark) {
                val insets = WindowCompat.getInsetsController(window, window.decorView)
                insets.isAppearanceLightStatusBars = !dark
                onDispose { }
            }
            DshTheme(dark) {
                if (vm.route == Route.Scan) {
                    ScanScreen(
                        onFound = { vm.onScanned(it) },
                        onClose = { vm.route = Route.Connect },
                    )
                } else {
                    DshRoot(
                        vm = vm,
                        onRequestScan = { requestScan() },
                        onOpenAppSettings = {
                            startActivity(
                                Intent(
                                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.fromParts("package", packageName, null),
                                ),
                            )
                        },
                    )
                }
            }
        }
    }

    private fun requestScan() {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) vm.route = Route.Scan else cameraPermission.launch(Manifest.permission.CAMERA)
    }
}

class DshVmFactory(private val store: EncryptedDeviceStore) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = DshViewModel(store) as T
}
