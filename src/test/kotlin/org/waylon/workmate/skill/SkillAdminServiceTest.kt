package org.waylon.workmate.skill

import io.agentscope.core.skill.AgentSkill
import io.agentscope.core.skill.repository.AgentSkillRepository
import io.agentscope.core.skill.repository.AgentSkillRepositoryInfo
import io.agentscope.harness.agent.HarnessAgent
import io.agentscope.harness.agent.skill.WorkspaceSkillRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.waylon.workmate.agent.AgentCatalog
import org.waylon.workmate.web.ApiException

class SkillAdminServiceTest {

	private fun fixture(repos: List<AgentSkillRepository>): SkillAdminService {
		val agent = mock(HarnessAgent::class.java)
		`when`(agent.skillRepositories).thenReturn(repos)
		val catalog = mock(AgentCatalog::class.java)
		`when`(catalog.agents).thenReturn(mapOf("default" to agent))
		return SkillAdminService(catalog)
	}

	private fun repo(source: String, writable: Boolean, type: String = "filesystem", location: String = "/skills"): AgentSkillRepository {
		val info = mock(AgentSkillRepositoryInfo::class.java)
		`when`(info.type).thenReturn(type)
		`when`(info.location).thenReturn(location)
		`when`(info.isWritable).thenReturn(writable)

		val repo = mock(AgentSkillRepository::class.java)
		`when`(repo.repositoryInfo).thenReturn(info)
		`when`(repo.source).thenReturn(source)
		`when`(repo.isWriteable).thenReturn(writable)
		return repo
	}

	private fun skill(name: String, description: String? = "desc"): AgentSkill {
		val skill = mock(AgentSkill::class.java)
		`when`(skill.name).thenReturn(name)
		`when`(skill.description).thenReturn(description)
		return skill
	}

	@Test
	fun `list merges same skill across repos and marks deletable`() {
		val shared = skill("my-skill")
		val r1 = repo("src1", writable = false)
		val r2 = repo("src2", writable = true)
		`when`(r1.allSkills).thenReturn(listOf(shared))
		`when`(r2.allSkills).thenReturn(listOf(shared))

		val list = fixture(listOf(r1, r2)).list("default")

		assertEquals(1, list.size)
		assertEquals("my-skill", list[0].name)
		assertEquals("desc", list[0].description)
		assertEquals(2, list[0].repositories.size)
		assertTrue(list[0].deletable)
	}

	@Test
	fun `list unknown agent throws 404`() {
		val e = assertThrows(ApiException::class.java) { fixture(emptyList()).list("nope") }
		assertEquals(404, e.status.value())
	}

	@Test
	fun `delete prefers workspace repo and archives with write toggle`() {
		val wsRepo = mock(WorkspaceSkillRepository::class.java)
		`when`(wsRepo.skillExists("my-skill")).thenReturn(true)
		`when`(wsRepo.isWriteable).thenReturn(false)
		`when`(wsRepo.delete("my-skill")).thenReturn(true)
		`when`(wsRepo.source).thenReturn("workspace-namespaced")

		val result = fixture(listOf(wsRepo)).delete("default", "my-skill")

		assertTrue(result.deleted)
		assertTrue(result.archived)
		assertEquals("workspace-namespaced", result.repository)
		verify(wsRepo).setWriteable(true)
		verify(wsRepo).setWriteable(false)
	}

	@Test
	fun `delete throws 409 when all repos read-only`() {
		val r = repo("src1", writable = false)
		`when`(r.skillExists("my-skill")).thenReturn(true)

		val e = assertThrows(ApiException::class.java) { fixture(listOf(r)).delete("default", "my-skill") }
		assertEquals(409, e.status.value())
	}

	@Test
	fun `delete throws 404 when skill absent`() {
		val r = repo("src1", writable = false)
		`when`(r.skillExists("my-skill")).thenReturn(false)

		val e = assertThrows(ApiException::class.java) { fixture(listOf(r)).delete("default", "my-skill") }
		assertEquals(404, e.status.value())
	}
}
