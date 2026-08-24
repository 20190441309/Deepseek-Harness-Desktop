package ai.deepseek.harness.mobile.pair

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Base64

class OfferTest {
    private fun b64url(json: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray(Charsets.UTF_8))

    @Test
    fun decodeOfferReadsV1LanAndRelay() {
        val lan = OfferCodec.decode(b64url("""{"v":1,"token":"secret-token","mode":"lan"}"""))
        assertEquals("secret-token", lan?.token)
        assertEquals("lan", lan?.mode)
        val relay = OfferCodec.decode(
            b64url("""{"v":1,"token":"secret-token","mode":"relay","relay":"https://relay.example"}"""),
        )
        assertEquals("relay", relay?.mode)
        assertEquals("https://relay.example", relay?.relay)
    }

    @Test
    fun fromHashReadsOfferAndIgnoresQuery() {
        val raw = b64url("""{"v":1,"token":"abc","mode":"lan"}""")
        assertEquals("abc", OfferCodec.fromHash("#offer=$raw")?.token)
        assertEquals("abc", OfferCodec.fromHash("?token=leaked#offer=$raw")?.token)
        assertNull(OfferCodec.fromHash("#nope=1"))
        assertNull(OfferCodec.decode("%%%"))
        assertNull(OfferCodec.decode(b64url("""{"v":2,"token":"x"}""")))
    }

    @Test
    fun fromPasteReadsUrlHashOrBareOffer() {
        val raw = b64url("""{"v":1,"token":"paste-token","mode":"lan"}""")
        assertEquals("paste-token", OfferCodec.fromPaste("https://relay.example/#offer=$raw")?.token)
        assertEquals("paste-token", OfferCodec.fromPaste("#offer=$raw")?.token)
        assertEquals("paste-token", OfferCodec.fromPaste("offer=$raw")?.token)
        assertNull(OfferCodec.fromPaste("https://relay.example/"))
    }
}
