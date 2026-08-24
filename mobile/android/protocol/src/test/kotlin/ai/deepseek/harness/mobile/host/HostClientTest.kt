package ai.deepseek.harness.mobile.host

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.TimeUnit

class HostClientTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun loginUnauthorizedThrows() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":"配对密钥无效"}"""))
        server.start()
        try {
            LoginClient.login(OkHttpClient(), server.url("/").toString().trimEnd('/'), "bad")
            throw AssertionError("expected UnauthorizedException")
        } catch (error: UnauthorizedException) {
            assertEquals("配对密钥无效", error.message)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun callUnaryUnauthorizedThrows() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401).setBody("no"))
        server.start()
        try {
            Rpc.callUnary(
                OkHttpClient(),
                server.url("/").toString().trimEnd('/'),
                "host.describe",
                buildJsonObject {},
                "expired",
            )
            throw AssertionError("expected UnauthorizedException")
        } catch (error: UnauthorizedException) {
            assertEquals("unauthorized", error.message)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun mintRpcIdIsUuidV4Shaped() {
        val id = Rpc.mintRpcId()
        assertTrue(id.matches(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
    }

    @Test
    fun loginPostsJsonAndReturnsDeviceToken() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true,"deviceToken":"device-1"}"""))
        server.start()
        try {
            val token = LoginClient.login(OkHttpClient(), server.url("/").toString().trimEnd('/'), "pair-secret")
            assertEquals("device-1", token)
            val recorded = server.takeRequest(2, TimeUnit.SECONDS)!!
            assertEquals("/__remote__/login", recorded.path)
            assertEquals("application/json", recorded.getHeader("accept"))
            assertTrue(recorded.body.readUtf8().contains("pair-secret"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun callUnaryPostsClientRequestAndEchoesRpcId() {
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val body = json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject
                return MockResponse().setBody(
                    """{"type":"server-response","rpcId":"${body["rpcId"]?.jsonPrimitive?.content}","result":{"ok":true,"value":{"version":"1"}}}""",
                )
            }
        }
        server.start()
        try {
            val origin = server.url("/").toString().trimEnd('/')
            val out = Rpc.callUnary(
                OkHttpClient(),
                origin,
                "host.describe",
                buildJsonObject {},
                "device-1",
            )
            assertTrue(out.ok)
            assertEquals("1", out.value?.jsonObject?.get("version")?.jsonPrimitive?.content)
            val recorded = server.takeRequest(2, TimeUnit.SECONDS)!!
            assertEquals("/api/host.describe", recorded.path)
            assertEquals("Bearer device-1", recorded.getHeader("Authorization"))
            val sent = json.parseToJsonElement(recorded.body.readUtf8()).jsonObject
            assertEquals("client-request", sent["type"]?.jsonPrimitive?.content)
            assertEquals("host.describe", sent["method"]?.jsonPrimitive?.content)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun callUnarySurfacesResultOkFalse() {
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val body = json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject
                return MockResponse().setBody(
                    """{"type":"server-response","rpcId":"${body["rpcId"]?.jsonPrimitive?.content}","result":{"ok":false,"error":{"code":"bad-request","message":"nope"}}}""",
                )
            }
        }
        server.start()
        try {
            val out = Rpc.callUnary(
                OkHttpClient(),
                server.url("/").toString().trimEnd('/'),
                "session.list",
                buildJsonObject {},
                "t",
            )
            assertFalse(out.ok)
            assertEquals("nope", out.error)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun respondPostsClientResponse() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"accepted":true}"""))
        server.start()
        try {
            Rpc.respond(
                OkHttpClient(),
                server.url("/").toString().trimEnd('/'),
                "req-1",
                buildJsonObject {
                    put("sessionId", "s1")
                    put("approvalId", "a1")
                    put("outcome", "allowed-once")
                },
                "t",
            )
            val recorded = server.takeRequest(2, TimeUnit.SECONDS)!!
            assertEquals("/api/respond", recorded.path)
            val sent = json.parseToJsonElement(recorded.body.readUtf8()).jsonObject
            assertEquals("client-response", sent["type"]?.jsonPrimitive?.content)
            assertEquals("req-1", sent["rpcId"]?.jsonPrimitive?.content)
            assertEquals("allowed-once", sent["result"]?.jsonObject?.get("value")?.jsonObject?.get("outcome")?.jsonPrimitive?.content)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun handshakeDescribesThenListsBeforeOpeningSockets() = runBlocking {
        val order = mutableListOf<String>()
        val connected = Handshake.run(
            call = { method, _ ->
                order.add(method)
                UnaryResult(rpcId = "x", ok = true, value = buildJsonObject {
                    if (method == "host.describe") put("cwd", "/tmp")
                    if (method == "session.list") put("items", kotlinx.serialization.json.buildJsonArray {})
                })
            },
            connectEvents = { order.add("events") },
        )
        assertEquals("host.describe", order.first())
        assertEquals("events", order.last())
        assertEquals(setOf("host.describe", "session.list", "workspace.list"), order.take(3).toSet())
        assertEquals("/tmp", connected.host.jsonObject["cwd"]?.jsonPrimitive?.content)
    }

    @Test
    fun handshakeDoesNotOpenSocketsWhenDescribeFails() = runBlocking {
        var events = 0
        try {
            Handshake.run(
                call = { method, _ ->
                    if (method == "host.describe") UnaryResult("x", false, error = "nope")
                    else UnaryResult("x", true, value = buildJsonObject {})
                },
                connectEvents = { events += 1 },
            )
        } catch (_: IllegalStateException) {
            // expected
        }
        assertEquals(0, events)
    }

    @Test
    fun toWsConvertsHttpOrigin() {
        assertEquals("ws://127.0.0.1:3180/api/events.mux", Rpc.toWs("http://127.0.0.1:3180", "/api/events.mux"))
        assertEquals("wss://relay.example/api/events.host", Rpc.toWs("https://relay.example", "/api/events.host"))
    }
}
