package org.waylon.workmate.web

import org.springframework.http.HttpStatus

/**
 * 业务侧 REST 异常。
 *
 * <p>承载「客户端可理解的语义化错误」，由 [ApiExceptionHandler] 统一转换为 RFC 7807
 * （`application/problem+json`）响应。控制器不再返回 `HTTP 200 + {"error": ...}` —— 那会让前端
 * 把失败当成功处理（历史问题：`POST /api/jobs` 未知 agent 返回 200，表单被清空且无提示）。
 *
 * @param status HTTP 状态码
 * @param detail 面向调用方的错误说明（会写进 ProblemDetail.detail）
 */
open class ApiException(
	val status: HttpStatus,
	val detail: String,
) : RuntimeException(detail) {

	companion object {
		/** 404：目标资源（agent / skill / 任务）不存在。 */
		fun notFound(detail: String) = ApiException(HttpStatus.NOT_FOUND, detail)

		/** 400：请求参数不合法（如非法 cron 表达式）。 */
		fun badRequest(detail: String) = ApiException(HttpStatus.BAD_REQUEST, detail)

		/** 409：与当前资源状态冲突（如任务名重复、只读技能仓库无法删除）。 */
		fun conflict(detail: String) = ApiException(HttpStatus.CONFLICT, detail)
	}
}
