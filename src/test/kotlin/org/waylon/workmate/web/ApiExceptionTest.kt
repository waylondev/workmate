package org.waylon.workmate.web

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class ApiExceptionTest {

	@Test
	fun `notFound maps to 404`() {
		val e = ApiException.notFound("agent not found: nope")
		assertEquals(HttpStatus.NOT_FOUND, e.status)
		assertEquals("agent not found: nope", e.detail)
		assertEquals("agent not found: nope", e.message)
	}

	@Test
	fun `badRequest maps to 400`() {
		val e = ApiException.badRequest("invalid Quartz cron expression: nope")
		assertEquals(HttpStatus.BAD_REQUEST, e.status)
		assertEquals("invalid Quartz cron expression: nope", e.detail)
	}

	@Test
	fun `conflict maps to 409`() {
		val e = ApiException.conflict("job already exists: x")
		assertEquals(HttpStatus.CONFLICT, e.status)
		assertEquals("job already exists: x", e.detail)
	}
}
