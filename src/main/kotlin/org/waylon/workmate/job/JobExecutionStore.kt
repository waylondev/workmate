package org.waylon.workmate.job

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap

/**
 * 定时任务执行历史的落盘存储。
 *
 * <p>与 [JobDefinitionStore] 同构：官方 scheduler-quartz 不提供执行历史，本类补一层极简文件存储，
 * 把每个任务的最近 N 条执行记录序列化为单个 JSON 文件（`.agentscope/job-executions.json`），
 * 重启后保留。内存态用 `ConcurrentHashMap` 承载，写文件只做「持久化快照」，读接口始终读内存。
 *
 * <p>约束与 [JobDefinitionStore] 一致：不引数据库、不新增依赖（复用 Jackson）；文件是运行态数据，
 * 随 `.agentscope/` 一起被 `.gitignore` 忽略；损坏不阻断启动。
 */
class JobExecutionStore(
	private val file: Path,
	/** 每个任务保留的最近执行记录条数上限（防无界增长）。 */
	private val maxPerJob: Int = 50,
) {

	private val log = LoggerFactory.getLogger(JobExecutionStore::class.java)

	private val objectMapper = ObjectMapper()

	private val typeRef = object : TypeReference<List<JobExecution>>() {}

	/** jobName → 该任务最近若干条执行（新的在前）。 */
	private val executions = ConcurrentHashMap<String, MutableList<JobExecution>>()

	init {
		load()
	}

	/** 追加一条执行记录（新的在前），裁剪到上限后落盘快照。 */
	fun append(execution: JobExecution) {
		val list = executions.computeIfAbsent(execution.jobName) { mutableListOf() }
		synchronized(list) {
			list.add(0, execution)
			while (list.size > maxPerJob) list.removeAt(list.size - 1)
		}
		persist()
	}

	/** 返回某任务的全部执行记录（新的在前）。不存在时返回空列表。 */
	fun list(jobName: String): List<JobExecution> =
		executions[jobName]?.let { synchronized(it) { it.toList() } } ?: emptyList()

	/** 删除某任务的全部执行历史（取消任务时清理）。 */
	fun remove(jobName: String) {
		executions.remove(jobName)
		persist()
	}

	private fun load() {
		if (!Files.exists(file)) return
		try {
			val loaded: List<JobExecution> = objectMapper.readValue(file.toFile(), typeRef)
			loaded.forEach { e ->
				val list = executions.computeIfAbsent(e.jobName) { mutableListOf() }
				synchronized(list) {
					list.add(e)
					while (list.size > maxPerJob) list.removeAt(list.size - 1)
				}
			}
		} catch (e: Exception) {
			log.warn("job execution file {} unreadable, starting with empty history: {}", file, e.message)
		}
	}

	private fun persist() {
		try {
			file.parent?.let(Files::createDirectories)
			val snapshot: List<JobExecution> = executions.entries
				.flatMap { (_, list) -> synchronized(list) { list.toList() } }
				.sortedByDescending { it.startedAt }
			val tmp = file.resolveSibling("${file.fileName}.tmp")
			objectMapper.writeValue(tmp.toFile(), snapshot)
			Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
		} catch (e: Exception) {
			// 落盘失败不应影响执行记录的内存可用性
			log.error("failed to persist job executions", e)
		}
	}
}
