package main

import (
	"log"
)

func main() {
	if err := startServer(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
