package org.waylon.workmate.web

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.mockito.Mockito.mock
import org.springframework.http.HttpStatus
import org.springframework.http.server.reactive.ServerHttpRequest
import org.springframework.web.server.ServerWebExchange
import java.net.URI

class ApiExceptionHandlerTest {

	private fun exchangeWith(uri: String): ServerWebExchange {
		val request = mock(ServerHttpRequest::class.java)
		`when`(request.uri).thenReturn(URI.create(uri))
		val exchange = mock(ServerWebExchange::class.java)
		`when`(exchange.request).thenReturn(request)
		return exchange
	}

	@Test
	fun `handleApiException returns RFC 7807 problem`() {
		val handler = ApiExceptionHandler()
		val problem = handler.handleApiException(ApiException.notFound("agent not found: nope"), exchangeWith("/api/jobs"))

		assertEquals(HttpStatus.NOT_FOUND.value(), problem.status)
		assertEquals("agent not found: nope", problem.detail)
		assertEquals(URI.create("/api/jobs"), problem.instance)
	}

	@Test
	fun `handleUnexpected returns generic 500`() {
		val handler = ApiExceptionHandler()
		val problem = handler.handleUnexpected(RuntimeException("boom"), exchangeWith("/x"))

		assertEquals(HttpStatus.INTERNAL_SERVER_ERROR.value(), problem.status)
		assertEquals("internal server error", problem.detail)
	}
}
