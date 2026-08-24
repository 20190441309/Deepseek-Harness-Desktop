package ai.deepseek.harness.mobile.git

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ai.deepseek.harness.mobile.shell.RemoteShell
import java.util.concurrent.TimeUnit

class GitQuickShellTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun gitQuickUsesEnglishLabels() {
        val dirtyDefault = GitQuickResolver.resolve(
            VcsStatus(
                isRepo = true,
                refName = "main",
                hasWorkingTreeChanges = true,
                isDefaultRef = true,
                hasPrimaryRemote = true,
                hasUpstream = true,
            ),
            busy = false,
        )
        assertEquals("Commit & push", dirtyDefault.label)
        assertEquals("commit_push", dirtyDefault.action)

        val behind = GitQuickResolver.resolve(
            VcsStatus(isRepo = true, refName = "main", hasUpstream = true, behindCount = 2),
            busy = false,
        )
        assertEquals("Pull", behind.label)

        val idle = GitQuickResolver.resolve(
            VcsStatus(isRepo = true, refName = "main", hasUpstream = true, isDefaultRef = true),
            busy = false,
        )
        assertTrue(idle.disabled)
        assertEquals("Commit", idle.label)
    }

    @Test
    fun parseVcsStatusReadsNullPr() {
        val status = parseVcsStatus(
            json.parseToJsonElement(
                """{"isRepo":true,"refName":"main","hasWorkingTreeChanges":true,"pr":null}""",
            ).jsonObject,
        )
        assertEquals("main", status.refName)
        assertTrue(status.hasWorkingTreeChanges)
        assertEquals(null, status.pr)
    }

    @Test
    fun parseVcsStatusReadsShellJson() {
        val status = parseVcsStatus(
            json.parseToJsonElement(
                """{"isRepo":true,"refName":"feat","hasWorkingTreeChanges":true,"aheadCount":1,"behindCount":0,"isDefaultRef":false,"hasPrimaryRemote":true,"hasUpstream":true}""",
            ).jsonObject,
        )
        assertEquals("feat", status.refName)
        assertTrue(status.hasWorkingTreeChanges)
        assertEquals(1, status.aheadCount)
        val quick = GitQuickResolver.resolve(status, false)
        assertEquals("Commit, push & PR", quick.label)
    }

    @Test
    fun parseBranchListReadsGitShellJson() {
        val branches = parseBranchList(
            json.parseToJsonElement(
                """{"ok":true,"branches":[{"name":"main","isCurrent":true,"isRemote":false},{"name":"feat","isCurrent":false,"isRemote":false}]}""",
            ).jsonObject,
        )
        assertEquals(2, branches.size)
        assertEquals("main", branches[0].name)
        assertTrue(branches[0].isCurrent)
        assertEquals("feat", branches[1].name)
    }

    @Test
    fun shellWhitelistMatchesGateway() {
        assertTrue(RemoteShell.NAMES.contains("gitStatus"))
        assertTrue(RemoteShell.NAMES.contains("listDir"))
        assertFalse(RemoteShell.NAMES.contains("writeFile"))
        assertFalse(RemoteShell.NAMES.contains("ptyCreate"))
    }

    @Test
    fun remoteShellPostsWhitelistNameWithBearer() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"ok":true,"result":{"refName":"main","isRepo":true}}"""))
        server.start()
        try {
            val origin = server.url("/").toString().trimEnd('/')
            val result = RemoteShell.call(
                OkHttpClient(),
                origin,
                "device-1",
                "gitStatus",
                buildJsonObject { put("cwd", "/ws") },
            )
            assertEquals("main", result["refName"]?.jsonPrimitive?.content)
            val recorded = server.takeRequest(2, TimeUnit.SECONDS)!!
            assertEquals("/__remote__/shell/gitStatus", recorded.path)
            assertEquals("Bearer device-1", recorded.getHeader("Authorization"))
        } finally {
            server.shutdown()
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun remoteShellRejectsUnknownName() {
        RemoteShell.call(OkHttpClient(), "http://127.0.0.1", "t", "writeFile")
    }
}
