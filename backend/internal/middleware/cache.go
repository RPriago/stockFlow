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
	mc.items[key] = cacheItem{
		status:    status,
		headers:   headers.Clone(),
		body:      body,
		expiresAt: time.Now().Add(ttl),
	}
}

func (mc *MemoryCache) InvalidateAll() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.items = make(map[string]cacheItem)
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
				globalCache.InvalidateAll()

				// Broadcast real-time change event to all connected SSE clients
				resource := extractResource(c.Request.URL.Path)
				events.GetBroker().Broadcast("data_changed", gin.H{
					"resource":  resource,
					"method":    c.Request.Method,
					"path":      c.Request.URL.Path,
					"timestamp": time.Now().UnixMilli(),
				})
			}
			return
		}

		// Don't cache auth verification, health check, notifications, or SSE events
		if strings.HasPrefix(c.Request.URL.Path, "/api/v1/auth") || strings.HasPrefix(c.Request.URL.Path, "/api/v1/notifications") || strings.HasPrefix(c.Request.URL.Path, "/api/v1/events") || c.Request.URL.Path == "/health" {
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
