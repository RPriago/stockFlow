package middleware

import (
	"bytes"
	"net/http"
	"strings"
	"sync"
	"time"

	"stockflow-backend/internal/events"

	"github.com/gin-gonic/gin"
)

type cacheItem struct {
	status    int
	headers   http.Header
	body      []byte
	expiresAt time.Time
}

const (
	MaxCacheItems = 1000
)

type MemoryCache struct {
	mu    sync.RWMutex
	items map[string]cacheItem
}

var globalCache = &MemoryCache{
	items: make(map[string]cacheItem),
}

func (mc *MemoryCache) Get(key string) (cacheItem, bool) {
	mc.mu.RLock()
	defer mc.mu.RUnlock()
	item, found := mc.items[key]
	if !found || time.Now().After(item.expiresAt) {
		return cacheItem{}, false
	}
	return item, true
}

func (mc *MemoryCache) Set(key string, status int, headers http.Header, body []byte, ttl time.Duration) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	now := time.Now()

	// PERF-004: Cap Memory Cache Map Size to prevent unbounded memory growth
	if len(mc.items) >= MaxCacheItems {
		// First pass: purge expired items
		for k, it := range mc.items {
			if now.After(it.expiresAt) {
				delete(mc.items, k)
			}
		}

		// If still at capacity, evict oldest items up to 10%
		if len(mc.items) >= MaxCacheItems {
			evictCount := MaxCacheItems / 10
			for k := range mc.items {
				delete(mc.items, k)
				evictCount--
				if evictCount <= 0 {
					break
				}
			}
		}
	}

	mc.items[key] = cacheItem{
		status:    status,
		headers:   headers.Clone(),
		body:      body,
		expiresAt: now.Add(ttl),
	}
}

func (mc *MemoryCache) InvalidateAll() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.items = make(map[string]cacheItem)
}

// InvalidateByResource selectively purges cached responses for affected resource domains,
// eliminating cache invalidation blast radius during concurrent operations (PERF-001).
func (mc *MemoryCache) InvalidateByResource(resource string) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	var prefixes []string
	switch resource {
	case "products", "categories":
		prefixes = []string{"/api/v1/products", "/api/v1/categories"}
	case "warehouses", "locations":
		prefixes = []string{"/api/v1/warehouses", "/api/v1/locations", "/api/v1/inventory"}
	case "inventory":
		prefixes = []string{"/api/v1/inventory", "/api/v1/warehouses"}
	case "purchase_orders":
		prefixes = []string{"/api/v1/purchase-orders", "/api/v1/inventory"}
	case "sales_orders":
		prefixes = []string{"/api/v1/sales-orders", "/api/v1/outbound-orders", "/api/v1/inventory"}
	case "users":
		prefixes = []string{"/api/v1/users"}
	default:
		mc.items = make(map[string]cacheItem)
		return
	}

	for k := range mc.items {
		for _, prefix := range prefixes {
			if strings.Contains(k, prefix) {
				delete(mc.items, k)
				break
			}
		}
	}
}

type cachedWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w *cachedWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

func extractResource(path string) string {
	switch {
	case strings.Contains(path, "/products"):
		return "products"
	case strings.Contains(path, "/categories"):
		return "categories"
	case strings.Contains(path, "/warehouses"):
		return "warehouses"
	case strings.Contains(path, "/locations"):
		return "locations"
	case strings.Contains(path, "/inventory"):
		return "inventory"
	case strings.Contains(path, "/purchase-orders"):
		return "purchase_orders"
	case strings.Contains(path, "/sales-orders") || strings.Contains(path, "/outbound-orders"):
		return "sales_orders"
	case strings.Contains(path, "/users"):
		return "users"
	case strings.Contains(path, "/notifications"):
		return "notifications"
	default:
		return "general"
	}
}

// CacheMiddleware returns a Gin middleware that caches successful GET responses for the given TTL.
// Mutating methods (POST, PUT, DELETE, PATCH) automatically invalidate cached data upon 2xx status.
func CacheMiddleware(defaultTTL time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// If request is a mutation, pass through and invalidate on success
		if c.Request.Method != http.MethodGet {
			c.Next()
			if c.Writer.Status() >= 200 && c.Writer.Status() < 300 {
				resource := extractResource(c.Request.URL.Path)
				globalCache.InvalidateByResource(resource)

				// Broadcast real-time change event to all connected SSE clients
				events.GetBroker().Broadcast("data_changed", gin.H{
					"resource":  resource,
					"method":    c.Request.Method,
					"path":      c.Request.URL.Path,
					"timestamp": time.Now().UnixMilli(),
				})
			}
			return
		}

		// Don't cache auth verification, health check, notifications, users, admin, or SSE events
		if strings.HasPrefix(c.Request.URL.Path, "/api/v1/auth") ||
			strings.HasPrefix(c.Request.URL.Path, "/api/v1/notifications") ||
			strings.HasPrefix(c.Request.URL.Path, "/api/v1/events") ||
			strings.HasPrefix(c.Request.URL.Path, "/api/v1/users") ||
			strings.HasPrefix(c.Request.URL.Path, "/api/v1/admin") ||
			c.Request.URL.Path == "/health" {
			c.Next()
			return
		}

		cacheKey := c.Request.Method + ":" + c.Request.URL.RequestURI()
		if item, hit := globalCache.Get(cacheKey); hit {
			for k, values := range item.headers {
				for _, v := range values {
					c.Writer.Header().Set(k, v)
				}
			}
			c.Writer.Header().Set("X-Cache", "HIT")
			c.Data(item.status, item.headers.Get("Content-Type"), item.body)
			c.Abort()
			return
		}

		// Intercept writer to capture response
		buf := &bytes.Buffer{}
		writer := &cachedWriter{ResponseWriter: c.Writer, body: buf}
		c.Writer = writer

		c.Next()

		// Cache 200 OK responses
		if writer.Status() == http.StatusOK {
			c.Writer.Header().Set("X-Cache", "MISS")
			globalCache.Set(cacheKey, writer.Status(), writer.Header(), buf.Bytes(), defaultTTL)
		}
	}
}
