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

func TestCacheMiddleware_GranularInvalidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CacheMiddleware(2 * time.Second))

	productReads := 0
	r.GET("/api/v1/products", func(c *gin.Context) {
		productReads++
		c.JSON(http.StatusOK, gin.H{"items": []string{"prod1"}})
	})

	r.POST("/api/v1/inventory/stock-in", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "stocked"})
	})

	// 1. Initial product read -> MISS, productReads = 1
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if productReads != 1 {
		t.Fatalf("expected 1 product read, got %d", productReads)
	}

	// 2. Perform Stock-In mutation
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, httptest.NewRequest(http.MethodPost, "/api/v1/inventory/stock-in", nil))

	// 3. Product read should STILL BE A CACHE HIT (productReads stays 1)!
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if w3.Header().Get("X-Cache") != "HIT" || productReads != 1 {
		t.Fatalf("expected product cache to survive inventory mutation (HIT, count=1), got header=%s count=%d",
			w3.Header().Get("X-Cache"), productReads)
	}
}

func TestCache_AuthenticationBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	authMiddleware := func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token != "Bearer valid-token" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}

	api := r.Group("/api/v1")
	api.Use(authMiddleware)
	api.Use(CacheMiddleware(2 * time.Second))
	{
		api.GET("/products", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"data": "secret-products"})
		})
	}

	// 1. Authenticated user requests products -> 200 OK, cached
	w1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	req1.Header.Set("Authorization", "Bearer valid-token")
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for authenticated user, got %d", w1.Code)
	}

	// 2. Unauthenticated attacker requests products while cache is warm -> MUST BE 401 Unauthorized
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("SECURITY VIOLATION! Unauthenticated user received cached response with status %d (body: %s)", w2.Code, w2.Body.String())
	}
}
