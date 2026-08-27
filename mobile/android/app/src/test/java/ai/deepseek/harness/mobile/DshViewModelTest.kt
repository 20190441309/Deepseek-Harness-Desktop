package ai.deepseek.harness.mobile

import ai.deepseek.harness.mobile.store.DeviceStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class DshViewModelTest {
    @Test
    fun rememberedSpaOpensForStickyReconnectAndClearsLegacyCredentials() {
        val store = FakeStore(webAppUrl = "http://192.168.1.8:3180/")

        val vm = DshViewModel(store)

        assertEquals(Route.Web, vm.route)
        assertEquals("http://192.168.1.8:3180/", vm.webUrl)
        assertEquals(1, store.legacyClearCalls)
    }

    @Test
    fun v2PairingLoadsFullUrlButPersistsOnlyLandingPage() {
        val store = FakeStore()
        val vm = DshViewModel(store)
        val raw = Base64.getUrlEncoder().withoutPadding().encodeToString(
            """{"v":2,"serverId":"server-1","daemonPublicKeyB64":"daemon-key","relay":{"endpoint":"125.124.85.212:8411","useTls":false},"authBootstrap":{"version":1,"pairingToken":"one-time-token-123","expiresAtMs":1787817600000}}"""
                .toByteArray(),
        )
        val url = "http://192.168.1.8:3180/#offer=$raw"

        vm.pair(url)

        assertEquals(Route.Web, vm.route)
        assertEquals(url, vm.webUrl)
        assertEquals("http://192.168.1.8:3180/", store.webAppUrl)
    }

    @Test
    fun pairRejectsBareOfferBecauseWebViewNeedsTheDesktopLandingUrl() {
        val store = FakeStore()
        val vm = DshViewModel(store)

        vm.pair("#offer=abc")

        assertEquals(Route.Connect, vm.route)
        assertTrue(vm.error.contains("完整"))
        assertEquals("", store.webAppUrl)
    }

    private class FakeStore(
        override var webAppUrl: String = "",
        override var scheme: String = "system",
    ) : DeviceStore {
        var legacyClearCalls = 0

        override fun clearLegacyHttpCredentials() {
            legacyClearCalls += 1
        }
    }
}
