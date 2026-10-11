package org.waylon.workmate.web

import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.ServerWebInputException

/**
 * 业务 REST 的统一异常出口：一律返回 RFC 7807 `application/problem+json`。
 *
 * <p>`basePackages` 限定在 `org.waylon.workmate`：官方 AG-UI 端点（`io.agentscope.*`）有自己的
 * 事件流错误语义（`RUN_ERROR` 事件），不能被本处理器改写。
 *
 * <p>响应体形如：
 * ```json
 * { "type": "about:blank", "title": "Not Found", "status": 404,
 *   "detail": "agent not found: nope", "instance": "/api/jobs" }
 * ```
 */
@RestControllerAdvice(basePackages = ["org.waylon.workmate"])
class ApiExceptionHandler {

	private val log = LoggerFactory.getLogger(ApiExceptionHandler::class.java)

	@ExceptionHandler(ApiException::class)
	fun handleApiException(e: ApiException, exchange: ServerWebExchange): ProblemDetail =
		problem(e.status, e.detail, exchange)

	/** 请求体缺字段 / JSON 非法 / 类型不匹配等由 WebFlux 数据绑定抛出的 400。 */
	@ExceptionHandler(ServerWebInputException::class)
	fun handleServerWebInput(e: ServerWebInputException, exchange: ServerWebExchange): ProblemDetail {
		val reason = e.reason ?: e.message ?: "malformed request"
		return problem(HttpStatus.BAD_REQUEST, reason, exchange)
	}

	/** 控制器内未预期的异常：对外只给通用信息，细节留在服务端日志。 */
	@ExceptionHandler(Throwable::class)
	fun handleUnexpected(e: Throwable, exchange: ServerWebExchange): ProblemDetail {
		log.error("Unhandled error on {} {}", exchange.request.method, exchange.request.path, e)
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal server error", exchange)
	}

	private fun problem(status: HttpStatus, detail: String, exchange: ServerWebExchange): ProblemDetail =
		ProblemDetail.forStatusAndDetail(status, detail).apply {
			instance = exchange.request.uri
		}
}
