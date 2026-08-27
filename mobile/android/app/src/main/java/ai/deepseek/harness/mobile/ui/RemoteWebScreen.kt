package ai.deepseek.harness.mobile.ui

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun RemoteWebScreen(
    url: String,
    chromeClient: WebChromeClient,
    onLeave: () -> Unit,
    onLoadError: (String) -> Unit,
    onOpenExternal: (Uri) -> Unit,
) {
    val context = LocalContext.current
    val appOrigin = remember(url) { Uri.parse(url).origin() }
    val webView = remember {
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.mediaPlaybackRequiresUserGesture = true
            settings.setSupportMultipleWindows(false)
            settings.userAgentString = "${settings.userAgentString} DshAndroid/2"
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
        }
    }

    DisposableEffect(webView, chromeClient, appOrigin) {
        webView.webChromeClient = chromeClient
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val target = request.url
                if (target.origin() == appOrigin) return false
                if (target.scheme == "http" || target.scheme == "https") {
                    onOpenExternal(target)
                }
                return true
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (request.isForMainFrame) {
                    onLoadError("无法打开电脑上的手机页：${error.description}")
                }
            }
        }
        onDispose {
            webView.stopLoading()
            webView.webChromeClient = null
            webView.webViewClient = WebViewClient()
            webView.destroy()
        }
    }

    BackHandler {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            onLeave()
        }
    }

    AndroidView(
        factory = {
            webView.apply { loadUrl(url) }
        },
        update = { view ->
            if (view.url.isNullOrEmpty()) view.loadUrl(url)
        },
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing),
    )
}

private fun Uri.origin(): String =
    if (scheme == null || authority == null) "" else "${scheme!!.lowercase()}://${authority!!.lowercase()}"
