plugins {
	kotlin("jvm") version "2.3.21"
	kotlin("plugin.spring") version "2.3.21"
	id("org.springframework.boot") version "4.1.1"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "org.waylon"
version = "0.0.1-SNAPSHOT"

val agentscopeVersion = "2.0.4"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-webflux")
	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("io.agentscope:agentscope-harness:$agentscopeVersion")
	implementation("io.agentscope:agentscope-agui-spring-boot-starter:$agentscopeVersion")
	implementation("io.agentscope:agentscope-openai-spring-boot-starter:$agentscopeVersion")
	// 定时任务调度（栈无关，Quartz 实现；common 需显式引入，因 quartz 对它是 provided+optional 不传递）
	implementation("io.agentscope:agentscope-extensions-scheduler-common:$agentscopeVersion")
	implementation("io.agentscope:agentscope-extensions-scheduler-quartz:$agentscopeVersion")
	implementation("org.jetbrains.kotlin:kotlin-reflect")
	developmentOnly("org.springframework.boot:spring-boot-devtools")
	testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
	testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin {
	compilerOptions {
		freeCompilerArgs.addAll("-Xjsr305=strict", "-Xannotation-default-target=param-property")
	}
}

tasks.withType<Test> {
	useJUnitPlatform()
}
