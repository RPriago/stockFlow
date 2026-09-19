package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestCacheMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CacheMiddleware(2 * time.Second))

	callCount := 0
	r.GET("/test-data", func(c *gin.Context) {
		callCount++
		c.JSON(http.StatusOK, gin.H{"count": callCount})
	})

	r.POST("/test-data", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "updated"})
	})

	// 1st GET -> MISS, callCount=1
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodGet, "/test-data", nil)
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK || callCount != 1 {
		t.Fatalf("expected callCount 1 on initial request, got %d", callCount)
	}

	// 2nd GET -> HIT, callCount stays 1
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/test-data", nil)
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK || callCount != 1 {
		t.Fatalf("expected cache HIT with callCount 1, got %d", callCount)
	}
	if w2.Header().Get("X-Cache") != "HIT" {
		t.Fatalf("expected X-Cache header to be HIT, got %s", w2.Header().Get("X-Cache"))
	}

	// POST -> invalidates cache
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest(http.MethodPost, "/test-data", nil)
	r.ServeHTTP(w3, req3)

	// 3rd GET -> MISS after invalidation, callCount=2
	w4 := httptest.NewRecorder()
	req4, _ := http.NewRequest(http.MethodGet, "/test-data", nil)
	r.ServeHTTP(w4, req4)
	if w4.Code != http.StatusOK || callCount != 2 {
		t.Fatalf("expected callCount 2 after cache invalidation, got %d", callCount)
	}
}
