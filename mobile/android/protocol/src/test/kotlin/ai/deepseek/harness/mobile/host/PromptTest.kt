package ai.deepseek.harness.mobile.host

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.serialization.json.jsonPrimitive

class PromptTest {
    @Test
    fun payloadQueuesTextAndAllowedImages() {
        val payload = Prompt.payload(
            listOf(
                Prompt.textBlock("hi"),
                Prompt.imageBlock("image/png", byteArrayOf(1, 2, 3)),
            ),
        )
        assertEquals("queue", payload["mode"]?.jsonPrimitive?.content)
        val content = payload["content"]!!.toString()
        assertTrue(content.contains("\"type\":\"text\""))
        assertTrue(content.contains("\"type\":\"image\""))
        assertTrue(content.contains("image/png"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun imageBlockRejectsUnknownType() {
        Prompt.imageBlock("image/svg+xml", byteArrayOf(1))
    }
}
