package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

type ipRecord struct {
	count       int
	windowStart time.Time
}

// RateLimiter implements an in-memory, thread-safe sliding window rate limiter
// using Go standard library sync.RWMutex without external infrastructure overhead.
type RateLimiter struct {
	mu          sync.RWMutex
	records     map[string]*ipRecord
	limit       int
	window      time.Duration
	stopCleanup chan struct{}
}

// NewRateLimiter initializes a rate limiter with periodic cleanup to prevent memory bloat.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		records:     make(map[string]*ipRecord),
		limit:       limit,
		window:      window,
		stopCleanup: make(chan struct{}),
	}

	// Periodically purge stale IP entries
	go rl.cleanupLoop()

	return rl
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.window * 2)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for ip, rec := range rl.records {
				if now.Sub(rec.windowStart) > rl.window {
					delete(rl.records, ip)
				}
			}
			rl.mu.Unlock()
		case <-rl.stopCleanup:
			return
		}
	}
}

// Close stops the background cleanup routine
func (rl *RateLimiter) Close() {
	close(rl.stopCleanup)
}

// Allow checks whether the request from ip is permitted under current rate limit.
func (rl *RateLimiter) Allow(ip string) (bool, time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rec, exists := rl.records[ip]
	if !exists || now.Sub(rec.windowStart) >= rl.window {
		rl.records[ip] = &ipRecord{
			count:       1,
			windowStart: now,
		}
		return true, 0
	}

	if rec.count < rl.limit {
		rec.count++
		return true, 0
	}

	retryAfter := rl.window - now.Sub(rec.windowStart)
	if retryAfter < time.Second {
		retryAfter = time.Second
	}
	return false, retryAfter
}

// Middleware returns a Gin HandlerFunc that enforces rate limiting.
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			ip = "unknown"
		}

		allowed, retryAfter := rl.Allow(ip)
		if !allowed {
			retrySeconds := int(retryAfter.Seconds())
			if retrySeconds < 1 {
				retrySeconds = 1
			}
			c.Header("Retry-After", fmt.Sprintf("%d", retrySeconds))
			utils.ErrorResponse(
				c,
				http.StatusTooManyRequests,
				fmt.Sprintf("Too many requests. Please try again after %d seconds.", retrySeconds),
				nil,
			)
			c.Abort()
			return
		}

		c.Next()
	}
}
