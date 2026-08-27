package ai.deepseek.harness.mobile

import ai.deepseek.harness.mobile.pair.OfferCodec
import ai.deepseek.harness.mobile.store.DeviceStore
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

enum class Route { Connect, Permission, Scan, Web }

class DshViewModel(private val store: DeviceStore) : ViewModel() {
    var route by mutableStateOf(Route.Connect)
    var paste by mutableStateOf("")
    var error by mutableStateOf("")
    var webUrl by mutableStateOf("")
        private set
    var scheme by mutableStateOf(store.scheme)

    val hasRememberedWebApp: Boolean
        get() = store.webAppUrl.isNotEmpty()

    init {
        store.clearLegacyHttpCredentials()
        if (store.webAppUrl.isNotEmpty()) {
            webUrl = store.webAppUrl
            route = Route.Web
        }
    }

    fun connectFromPaste() {
        pair(paste)
    }

    fun onScanned(raw: String) {
        pair(raw)
    }

    fun pair(text: String) {
        error = ""
        val link = OfferCodec.parsePairingLink(text)
        if (link == null) {
            error = "无效的配对链接（需要完整的 ChisaCode offer v2 URL）"
            route = Route.Connect
            return
        }

        // The Web SPA owns the ChisaCode DaemonClient and stores its sticky
        // deviceSecret in WebView localStorage. Native code remembers only the
        // fragment-free LAN landing URL needed to reopen that same SPA.
        store.webAppUrl = link.landingUrl
        webUrl = link.url
        route = Route.Web
    }

    fun reopenWebApp() {
        val remembered = store.webAppUrl
        if (remembered.isEmpty()) return
        error = ""
        webUrl = remembered
        route = Route.Web
    }

    fun leaveWebApp() {
        webUrl = ""
        route = Route.Connect
    }

    fun persistScheme(value: String) {
        scheme = value
        store.scheme = value
    }
}
