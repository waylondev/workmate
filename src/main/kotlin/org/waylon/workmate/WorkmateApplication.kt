package org.waylon.workmate

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication

@SpringBootApplication
@ConfigurationPropertiesScan
class WorkmateApplication

fun main(args: Array<String>) {
	runApplication<WorkmateApplication>(*args)
}
