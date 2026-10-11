package org.waylon.workmate.job

import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * 定时任务定义的落盘存储。
 *
 * <p>官方 scheduler-quartz 扩展**不提供任务持久化**，任务定义只活在进程内 `ConcurrentHashMap`。
 * 本类补一层极简的文件存储：把 `name → {agentId, cron}` 序列化为单个 JSON 文件，
 * 进程重启后由 [JobSchedulerService] 加载并重新注册回 Quartz。
 *
 * <p>设计约束：不引数据库、不新增依赖（复用随依赖传递引入的 Jackson）。
 * 文件是「运行态数据」而非「配置」，放在 `.agentscope/` 下（已被 `.gitignore` 忽略）。
 *
 * <p>自建 [ObjectMapper] 而非注入 Spring bean：WebFlux 环境下 Spring 不保证暴露
 * `ObjectMapper` bean（本项目实测无该 bean），且本类的序列化需求极简，无需共享配置。
 */
class JobDefinitionStore(
	private val file: Path,
) {

	private val log = LoggerFactory.getLogger(JobDefinitionStore::class.java)

	private val objectMapper = ObjectMapper()

	private val typeRef = object : TypeReference<List<JobDefinition>>() {}

	/** 读取全部任务定义；文件不存在时返回空列表（首次运行）。 */
	fun load(): List<JobDefinition> {
		if (!Files.exists(file)) return emptyList()
		return try {
			objectMapper.readValue(file.toFile(), typeRef)
		} catch (e: Exception) {
			// 持久化文件损坏不应阻断启动：记录并视为空，让调度器可空启动
			log.warn("job definition file {} unreadable, starting with no jobs: {}", file, e.message)
			emptyList()
		}
	}

	/** 原子写回全部任务定义（先写临时文件再 move，避免半截写入）。 */
	fun save(definitions: List<JobDefinition>) {
		file.parent?.let(Files::createDirectories)
		val tmp = file.resolveSibling("${file.fileName}.tmp")
		objectMapper.writeValue(tmp.toFile(), definitions)
		Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
	}
}

/** 任务定义：官方任务对象不保留 agentId，业务侧自留一份（同时是持久化单元）。 */
data class JobDefinition @JsonCreator constructor(
	@JsonProperty("name") val name: String,
	@JsonProperty("agentId") val agentId: String,
	@JsonProperty("cron") val cron: String,
)
