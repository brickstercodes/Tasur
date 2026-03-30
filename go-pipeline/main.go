package main

import (
	"log"
	"os"
)

func main() {
	// Railway and many log collectors treat stderr as error-level.
	// Send normal logs to stdout so startup/info lines are not flagged as errors.
	log.SetOutput(os.Stdout)

	if err := startServer(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
