package org.waylon.workmate.session

import io.agentscope.harness.agent.HarnessAgent
import io.agentscope.harness.agent.workspace.WorkspaceManager
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.`when`
import org.mockito.Mockito.mock
import org.waylon.workmate.agent.AgentCatalog
import org.waylon.workmate.web.ApiException
import java.nio.file.Files
import java.nio.file.Path

class SessionAdminServiceTest {

	private fun fixture(workspaceDir: Path): SessionAdminService {
		val wm = mock(WorkspaceManager::class.java)
		`when`(wm.workspace).thenReturn(workspaceDir)
		val agent = mock(HarnessAgent::class.java)
		`when`(agent.workspaceManager).thenReturn(wm)
		`when`(agent.name).thenReturn("Workmate")
		val catalog = mock(AgentCatalog::class.java)
		`when`(catalog.agents).thenReturn(mapOf("default" to agent))
		return SessionAdminService(catalog)
	}

	@Test
	fun `list filters special dirs and returns session dirs`(@TempDir dir: Path) {
		val ws = dir.resolve("ws")
		Files.createDirectories(ws.resolve("session-1"))
		Files.createDirectories(ws.resolve("session-2"))
		Files.createDirectories(ws.resolve("skills"))
		Files.createDirectories(ws.resolve("agents"))
		Files.createDirectories(ws.resolve("default"))

		val sessions = fixture(ws).list("default")

		val names = sessions.map { it.sessionId }.toSet()
		assertEquals(setOf("session-1", "session-2"), names)
		assertTrue(sessions.all { it.agentId == "default" && it.agentName == "Workmate" })
	}

	@Test
	fun `list unknown agent throws 404`(@TempDir dir: Path) {
		val e = assertThrows(ApiException::class.java) { fixture(dir.resolve("ws")).list("nope") }
		assertEquals(404, e.status.value())
	}

	@Test
	fun `delete removes session directory`(@TempDir dir: Path) {
		val ws = dir.resolve("ws")
		val sessionDir = ws.resolve("session-1")
		Files.createDirectories(sessionDir)
		Files.writeString(sessionDir.resolve("transcript.jsonl"), "line1\n")

		val result = fixture(ws).delete("default", "session-1")

		assertTrue(result.deleted)
		assertEquals("session-1", result.sessionId)
		assertEquals(1, result.removedFiles)
		assertFalse(Files.exists(sessionDir))
	}

	@Test
	fun `delete missing session throws 404`(@TempDir dir: Path) {
		val ws = dir.resolve("ws")
		Files.createDirectories(ws)
		val e = assertThrows(ApiException::class.java) { fixture(ws).delete("default", "missing") }
		assertEquals(404, e.status.value())
	}

	@Test
	fun `delete rejects path traversal`(@TempDir dir: Path) {
		val ws = dir.resolve("ws")
		Files.createDirectories(ws)
		val e = assertThrows(ApiException::class.java) { fixture(ws).delete("default", "../outside") }
		assertEquals(400, e.status.value())
	}
}
