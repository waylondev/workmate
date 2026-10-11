package org.waylon.workmate

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class WorkmateApplication

fun main(args: Array<String>) {
	runApplication<WorkmateApplication>(*args)
}
