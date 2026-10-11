package org.waylon.workmate.job

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path

class JobDefinitionStoreTest {

	@Test
	fun `save then load round-trips definitions`(@TempDir dir: Path) {
		val store = JobDefinitionStore(dir.resolve("jobs.json"))
		val defs = listOf(
			JobDefinition(name = "morning-report", agentId = "default", cron = "0 0 8 * * ?"),
			JobDefinition(name = "nightly-sync", agentId = "coder", cron = "0 30 23 * * ?"),
		)

		store.save(defs)

		assertEquals(defs, store.load())
	}

	@Test
	fun `load returns empty when file absent`(@TempDir dir: Path) {
		val store = JobDefinitionStore(dir.resolve("nope.json"))

		assertTrue(store.load().isEmpty())
	}

	@Test
	fun `load returns empty when file is corrupt`(@TempDir dir: Path) {
		val file = dir.resolve("jobs.json")
		java.nio.file.Files.writeString(file, "{ not valid json")
		val store = JobDefinitionStore(file)

		assertTrue(store.load().isEmpty())
	}
}
