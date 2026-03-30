package main

import (
	"context"
	"os"
	"strconv"
	"sync/atomic"
	"time"
)

// mmRateLimit is the global rate limiter for Vertex AI mm-generation calls.
// Initialised once in startServer and shared across all requests.
var mmRateLimit *apiRateLimiter

// apiRateLimiter is a simple token-bucket rate limiter backed by a channel.
// A background goroutine refills one token every (1min / ratePerMinute).
type apiRateLimiter struct {
	tokens chan struct{}
	depth  atomic.Int32 // number of callers currently waiting for a token
}

// newAPIRateLimiter creates a rate limiter that allows ratePerMinute calls per minute.
// The bucket starts full so the first burst of requests isn't artificially delayed.
func newAPIRateLimiter(ratePerMinute int) *apiRateLimiter {
	rl := &apiRateLimiter{
		tokens: make(chan struct{}, ratePerMinute),
	}
	// Pre-fill
	for i := 0; i < ratePerMinute; i++ {
		rl.tokens <- struct{}{}
	}
	// Refill goroutine — runs for the lifetime of the process
	go func() {
		interval := time.Minute / time.Duration(ratePerMinute)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			select {
			case rl.tokens <- struct{}{}:
			default: // bucket already full
			}
		}
	}()
	return rl
}

// Wait blocks until a rate-limit token is available or ctx is cancelled.
// Returns the caller's queue position (1-based) at the time they entered the wait.
func (rl *apiRateLimiter) Wait(ctx context.Context) (position int, err error) {
	pos := int(rl.depth.Add(1))
	defer rl.depth.Add(-1)
	select {
	case <-rl.tokens:
		return pos, nil
	case <-ctx.Done():
		return pos, ctx.Err()
	}
}

// QueueDepth returns the number of callers currently waiting for a token.
func (rl *apiRateLimiter) QueueDepth() int {
	return int(rl.depth.Load())
}

// mmRatePerMinute reads MM_RATE_LIMIT_PER_MINUTE from the environment.
// Defaults to 8 (conservative for a 10 RPM quota; leaves headroom for retries).
func mmRatePerMinute() int {
	if v := os.Getenv("MM_RATE_LIMIT_PER_MINUTE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 8
}
