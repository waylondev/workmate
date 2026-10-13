package org.waylon.workmate.job

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class JobExecutionStoreTest {

	private fun exec(jobName: String, startedAt: Long, status: String = "success", output: String? = "ok") =
		JobExecution(
			jobName = jobName,
			startedAt = startedAt,
			finishedAt = startedAt,
			status = status,
			output = output,
			error = null,
			inputTokens = null,
			outputTokens = null,
		)

	@Test
	fun `append then list returns newest first`(@TempDir dir: Path) {
		val store = JobExecutionStore(dir.resolve("exec.json"))
		store.append(exec("job-a", 100))
		store.append(exec("job-a", 200))

		val list = store.list("job-a")

		assertEquals(2, list.size)
		assertEquals(200L, list[0].startedAt)
		assertEquals(100L, list[1].startedAt)
	}

	@Test
	fun `list unknown job returns empty`(@TempDir dir: Path) {
		val store = JobExecutionStore(dir.resolve("exec.json"))

		assertTrue(store.list("nope").isEmpty())
	}

	@Test
	fun `cap keeps only most recent maxPerJob entries`(@TempDir dir: Path) {
		val store = JobExecutionStore(dir.resolve("exec.json"), maxPerJob = 3)
		for (i in 1..5) store.append(exec("job-a", i.toLong()))

		val list = store.list("job-a")

		assertEquals(3, list.size)
		assertEquals(5L, list.first().startedAt)
		assertEquals(3L, list.last().startedAt)
	}

	@Test
	fun `remove clears history and persists`(@TempDir dir: Path) {
		val file = dir.resolve("exec.json")
		val store = JobExecutionStore(file)
		store.append(exec("job-a", 1))

		store.remove("job-a")

		assertTrue(store.list("job-a").isEmpty())
		val reloaded = JobExecutionStore(file)
		assertTrue(reloaded.list("job-a").isEmpty())
	}

	@Test
	fun `load restores history from disk`(@TempDir dir: Path) {
		val file = dir.resolve("exec.json")
		val store = JobExecutionStore(file)
		store.append(exec("job-a", 7))

		val reloaded = JobExecutionStore(file)

		assertEquals(1, reloaded.list("job-a").size)
		assertEquals(7L, reloaded.list("job-a")[0].startedAt)
	}

	@Test
	fun `load corrupt file starts empty`(@TempDir dir: Path) {
		val file = dir.resolve("exec.json")
		Files.writeString(file, "{ not valid json")

		val store = JobExecutionStore(file)

		assertTrue(store.list("anything").isEmpty())
	}
}
