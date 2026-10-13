package org.waylon.workmate.job

import io.agentscope.core.model.Model
import io.agentscope.extensions.scheduler.AgentScheduler
import io.agentscope.extensions.scheduler.ScheduleAgentTask
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.`when`
import org.mockito.Mockito.mock
import org.springframework.http.HttpStatus
import org.waylon.workmate.agent.AgentProperties
import org.waylon.workmate.agent.WorkmateProperties
import org.waylon.workmate.web.ApiException
import java.nio.file.Path

class JobSchedulerServiceTest {

	private fun newService(dir: Path, scheduler: AgentScheduler = mock(AgentScheduler::class.java)): JobSchedulerService {
		val model = mock(Model::class.java)
		val store = JobDefinitionStore(dir.resolve("jobs.json"))
		val execStore = JobExecutionStore(dir.resolve("exec.json"))
		val props = WorkmateProperties(
			mapOf("default" to AgentProperties(name = "Workmate", sysPrompt = "you are workmate", workspace = dir)),
		)
		return JobSchedulerService(scheduler, model, props, store, execStore)
	}

	@Test
	fun `schedule blank name returns 400`(@TempDir dir: Path) {
		val e = assertThrows(ApiException::class.java) { newService(dir).schedule("   ", "default", "0 0 8 * * ?") }
		assertEquals(HttpStatus.BAD_REQUEST, e.status)
	}

	@Test
	fun `schedule blank agentId returns 400`(@TempDir dir: Path) {
		val e = assertThrows(ApiException::class.java) { newService(dir).schedule("job", "  ", "0 0 8 * * ?") }
		assertEquals(HttpStatus.BAD_REQUEST, e.status)
	}

	@Test
	fun `schedule unknown agent returns 404`(@TempDir dir: Path) {
		val e = assertThrows(ApiException::class.java) { newService(dir).schedule("job", "nope", "0 0 8 * * ?") }
		assertEquals(HttpStatus.NOT_FOUND, e.status)
	}

	@Test
	fun `schedule invalid cron returns 400`(@TempDir dir: Path) {
		val e = assertThrows(ApiException::class.java) { newService(dir).schedule("job", "default", "not-a-cron") }
		assertEquals(HttpStatus.BAD_REQUEST, e.status)
	}

	@Test
	fun `schedule duplicate name returns 409`(@TempDir dir: Path) {
		val scheduler = mock(AgentScheduler::class.java)
		`when`(scheduler.getScheduledAgent("job")).thenReturn(mock(ScheduleAgentTask::class.java))
		val e = assertThrows(ApiException::class.java) { newService(dir, scheduler).schedule("job", "default", "0 0 8 * * ?") }
		assertEquals(HttpStatus.CONFLICT, e.status)
	}

	@Test
	fun `schedule success returns projected view`(@TempDir dir: Path) {
		val scheduler = mock(AgentScheduler::class.java)
		val task = mock(ScheduleAgentTask::class.java)
		`when`(task.id).thenReturn("task-1")
		`when`(scheduler.schedule(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn(task)

		val view = newService(dir, scheduler).schedule(" job ", "default", "0 0 8 * * ?")

		assertEquals("job", view.name)
		assertEquals("task-1", view.id)
		assertEquals("default", view.agentId)
		assertEquals("0 0 8 * * ?", view.cron)
		assertEquals(0L, view.executions)
	}

	@Test
	fun `cancel removes definition and returns true`(@TempDir dir: Path) {
		val scheduler = mock(AgentScheduler::class.java)
		val task = mock(ScheduleAgentTask::class.java)
		`when`(task.id).thenReturn("task-1")
		`when`(scheduler.schedule(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn(task)
		val service = newService(dir, scheduler)
		service.schedule("job", "default", "0 0 8 * * ?")

		`when`(scheduler.cancel("job")).thenReturn(true)
		assertTrue(service.cancel("job"))
		assertTrue(service.list().none { it.name == "job" })
	}

	@Test
	fun `cancel unknown job returns false`(@TempDir dir: Path) {
		val scheduler = mock(AgentScheduler::class.java)
		`when`(scheduler.cancel("nope")).thenReturn(false)
		assertFalse(newService(dir, scheduler).cancel("nope"))
	}

	@Test
	fun `listExecutions delegates and trims name`(@TempDir dir: Path) {
		val service = newService(dir)
		service.listExecutions("") // no-op smoke
		assertTrue(service.listExecutions("  missing  ").isEmpty())
	}
}
