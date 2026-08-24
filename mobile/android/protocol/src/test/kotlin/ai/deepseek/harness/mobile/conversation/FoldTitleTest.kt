package ai.deepseek.harness.mobile.conversation

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class FoldTitleTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun foldEventsBuildsUserAssistantToolAndImages() {
        val entries = json.parseToJsonElement(
            """
            [
              {"event":{"type":"user/message","seq":1,"data":{"id":"m1","source":{"kind":"user"},"content":[{"type":"text","text":"你好"},{"type":"image","mediaType":"image/png","data":"abc"}]}}},
              {"event":{"type":"assistant/chunk","seq":2,"data":{"chunk":{"type":"text","text":"帮"}}}},
              {"event":{"type":"assistant/chunk","seq":3,"data":{"chunk":{"type":"text","text":"你"}}}},
              {"event":{"type":"assistant/message","seq":4,"data":{"message":{"content":[{"type":"text","text":"帮你"}]}}}},
              {"event":{"type":"tool/call","seq":5,"data":{"name":"read_file","callId":"c1"}},"view":{"for":"call","view":{"card":"read_file"}}}
            ]
            """.trimIndent(),
        ).jsonArray
        val rows = Fold.foldEvents(entries)
        assertEquals("user", rows[0].role)
        assertEquals("你好", rows[0].text)
        assertEquals(1, rows[0].images.size)
        assertEquals("image/png", rows[0].images[0].mediaType)
        assertEquals("assistant", rows[1].role)
        assertEquals("帮你", rows[1].text)
        assertEquals("tool", rows[2].role)
        assertEquals("read_file", rows[2].card)
    }

    @Test
    fun sessionTitlePrefersBlankThenProjectionThenShortId() {
        assertEquals("新会话", Title.sessionTitle(ai.deepseek.harness.mobile.host.SessionRow("abcdefghij", blank = true)))
        assertEquals(
            "修远程",
            Title.sessionTitle(
                ai.deepseek.harness.mobile.host.SessionRow("abcdefghij", blank = false),
                json.parseToJsonElement("""{"values":{"title":"修远程"}}""").jsonObject,
            ),
        )
        assertEquals("abcdefg", Title.sessionTitle(ai.deepseek.harness.mobile.host.SessionRow("abcdefghij", blank = false)))
    }
}
