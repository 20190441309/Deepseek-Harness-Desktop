package ai.deepseek.harness.mobile.conversation

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun muxPatchFoldsApprovalForOpenSession() {
        val frame = json.parseToJsonElement(
            """{"type":"server-request","rpcId":"r1","payload":{"type":"approval/requested","sessionId":"s1","approvalId":"a1","toolName":"bash","reason":"rm -rf"}}""",
        ).jsonObject
        val asked = Live.muxPatch(frame, "s1")
        assertTrue(asked is MuxPatch.Approval)
        assertEquals("a1", (asked as MuxPatch.Approval).pending.approvalId)
        assertEquals("bash", asked.pending.title)
        val done = Live.muxPatch(
            json.parseToJsonElement("""{"type":"server-request","payload":{"type":"approval/resolved","sessionId":"s1"}}""").jsonObject,
            "s1",
        )
        assertEquals(MuxPatch.ApprovalClear, done)
    }
}
