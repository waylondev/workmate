package org.waylon.workmate.job

import io.agentscope.core.agent.Agent
import io.agentscope.core.hook.ErrorEvent
import io.agentscope.core.hook.HookEvent
import io.agentscope.core.hook.HookEventType
import io.agentscope.core.hook.PostCallEvent
import io.agentscope.core.message.Msg
import io.agentscope.core.model.ChatUsage
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.`when`
import org.mockito.Mockito.mock
import java.nio.file.Path

class ExecutionRecordingHookTest {

	@Test
	fun `POST_CALL records success with output and tokens`(@TempDir dir: Path) {
		val store = JobExecutionStore(dir.resolve("exec.json"))
		val hook = ExecutionRecordingHook("job-a", store)

		val msg = mock(Msg::class.java)
		`when`(msg.textContent).thenReturn("hello world")
		val usage = mock(ChatUsage::class.java)
		`when`(usage.inputTokens).thenReturn(10)
		`when`(usage.outputTokens).thenReturn(5)
		`when`(msg.usage).thenReturn(usage)

		hook.onEvent(PostCallEvent(mock(Agent::class.java), msg)).block()

		val records = store.list("job-a")
		assertEquals(1, records.size)
		assertEquals("success", records[0].status)
		assertEquals("hello world", records[0].output)
		assertNull(records[0].error)
		assertEquals(10L, records[0].inputTokens)
		assertEquals(5L, records[0].outputTokens)
	}

	@Test
	fun `ERROR records failed with message`(@TempDir dir: Path) {
		val store = JobExecutionStore(dir.resolve("exec.json"))
		val hook = ExecutionRecordingHook("job-a", store)

		hook.onEvent(ErrorEvent(mock(Agent::class.java), RuntimeException("boom"))).block()

		val records = store.list("job-a")
		assertEquals(1, records.size)
		assertEquals("failed", records[0].status)
		assertEquals("boom", records[0].error)
		assertNull(records[0].output)
	}

	@Test
	fun `other event types are ignored`(@TempDir dir: Path) {
		val store = JobExecutionStore(dir.resolve("exec.json"))
		val hook = ExecutionRecordingHook("job-a", store)

		// HookEvent 是 sealed 抽象类，无法 mock/继承；改用具体子类 PostCallEvent，
		// 并覆盖其 final getType() 为非 POST_CALL/ERROR 的事件类型，验证 else 分支不落盘。
		val preCall = mock(PostCallEvent::class.java)
		`when`(preCall.type).thenReturn(HookEventType.PRE_CALL)
		hook.onEvent(preCall).block()

		assertTrue(store.list("job-a").isEmpty())
	}
}
