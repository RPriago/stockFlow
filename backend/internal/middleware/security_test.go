package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"stockflow-backend/internal/config"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestSecurityHeaders(t *testing.T) {
	router := gin.New()
	router.Use(SecurityHeadersMiddleware())
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// 1. Regular HTTP request
	req, _ := http.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	headers := w.Header()
	expectedHeaders := map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"X-Frame-Options":         "DENY",
		"X-XSS-Protection":        "1; mode=block",
		"Referrer-Policy":         "strict-origin-when-cross-origin",
		"Permissions-Policy":      "geolocation=(), camera=(), microphone=()",
		"Content-Security-Policy": "default-src 'self'; frame-ancestors 'none';",
	}

	for k, v := range expectedHeaders {
		if got := headers.Get(k); got != v {
			t.Errorf("header %s: expected %q, got %q", k, v, got)
		}
	}

	// 2. HTTPS reverse-proxy request (should set HSTS)
	reqHTTPS, _ := http.NewRequest(http.MethodGet, "/test", nil)
	reqHTTPS.Header.Set("X-Forwarded-Proto", "https")
	wHTTPS := httptest.NewRecorder()
	router.ServeHTTP(wHTTPS, reqHTTPS)

	hsts := wHTTPS.Header().Get("Strict-Transport-Security")
	if !strings.Contains(hsts, "max-age=31536000") {
		t.Errorf("expected HSTS header on HTTPS, got %q", hsts)
	}
}

func TestRateLimiter(t *testing.T) {
	limiter := NewRateLimiter(3, 200*time.Millisecond)
	defer limiter.Close()

	router := gin.New()
	router.Use(limiter.Middleware())
	router.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
	})

	// Requests 1, 2, 3 should succeed
	for i := 1; i <= 3; i++ {
		req, _ := http.NewRequest(http.MethodGet, "/ping", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i, w.Code)
		}
	}

	// Request 4 should be rate limited (429)
	req4, _ := http.NewRequest(http.MethodGet, "/ping", nil)
	w4 := httptest.NewRecorder()
	router.ServeHTTP(w4, req4)
	if w4.Code != http.StatusTooManyRequests {
		t.Fatalf("request 4: expected 429, got %d", w4.Code)
	}
	if retryAfter := w4.Header().Get("Retry-After"); retryAfter == "" {
		t.Error("expected Retry-After header on 429 response")
	}

	// Wait for sliding window to reset
	time.Sleep(250 * time.Millisecond)

	// Request 5 should succeed again
	req5, _ := http.NewRequest(http.MethodGet, "/ping", nil)
	w5 := httptest.NewRecorder()
	router.ServeHTTP(w5, req5)
	if w5.Code != http.StatusOK {
		t.Fatalf("request 5 after window: expected 200, got %d", w5.Code)
	}
}

func TestBodyLimitMiddleware(t *testing.T) {
	router := gin.New()
	router.Use(BodyLimitMiddleware(100)) // Max 100 bytes
	router.POST("/upload", func(c *gin.Context) {
		c.String(http.StatusOK, "received")
	})

	// 1. Body under limit
	smallBody := bytes.NewBufferString(`{"name":"test"}`)
	req1, _ := http.NewRequest(http.MethodPost, "/upload", smallBody)
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 for small body, got %d", w1.Code)
	}

	// 2. Body exceeding limit
	largeData := strings.Repeat("A", 200)
	req2, _ := http.NewRequest(http.MethodPost, "/upload", bytes.NewBufferString(largeData))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413 for oversized body, got %d", w2.Code)
	}
}

func TestCSRFProtectionMiddleware(t *testing.T) {
	cfg := &config.Config{
		FrontendURL: "https://stock-flow-brown.vercel.app",
	}

	router := gin.New()
	router.Use(CSRFProtectionMiddleware(cfg))
	router.POST("/api/v1/resource", func(c *gin.Context) {
		c.String(http.StatusOK, "mutated")
	})
	router.GET("/api/v1/resource", func(c *gin.Context) {
		c.String(http.StatusOK, "read")
	})

	// 1. GET requests bypass CSRF
	reqGet, _ := http.NewRequest(http.MethodGet, "/api/v1/resource", nil)
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("GET expected 200, got %d", wGet.Code)
	}

	// 2. Reject form URL-encoded submission
	reqForm, _ := http.NewRequest(http.MethodPost, "/api/v1/resource", strings.NewReader("bad=data"))
	reqForm.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	wForm := httptest.NewRecorder()
	router.ServeHTTP(wForm, reqForm)
	if wForm.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("Form post expected 415, got %d", wForm.Code)
	}

	// 3. Reject malicious cross-site Origin
	reqBadOrigin, _ := http.NewRequest(http.MethodPost, "/api/v1/resource", strings.NewReader(`{}`))
	reqBadOrigin.Header.Set("Content-Type", "application/json")
	reqBadOrigin.Header.Set("Origin", "https://evil-attacker.com")
	wBadOrigin := httptest.NewRecorder()
	router.ServeHTTP(wBadOrigin, reqBadOrigin)
	if wBadOrigin.Code != http.StatusForbidden {
		t.Fatalf("Evil origin expected 403, got %d", wBadOrigin.Code)
	}

	// 4. Allow legitimate Origin with custom header
	reqGood, _ := http.NewRequest(http.MethodPost, "/api/v1/resource", strings.NewReader(`{}`))
	reqGood.Header.Set("Content-Type", "application/json")
	reqGood.Header.Set("Origin", "https://stock-flow-brown.vercel.app")
	reqGood.Header.Set("X-Requested-With", "XMLHttpRequest")
	wGood := httptest.NewRecorder()
	router.ServeHTTP(wGood, reqGood)
	if wGood.Code != http.StatusOK {
		t.Fatalf("Legitimate request expected 200, got %d", wGood.Code)
	}
}
