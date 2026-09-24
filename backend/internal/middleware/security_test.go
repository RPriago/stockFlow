package middleware

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
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

func TestRateLimiter_SpoofedXForwardedFor(t *testing.T) {
	limiter := NewRateLimiter(2, 500*time.Millisecond)
	defer limiter.Close()

	router := gin.New()
	_ = router.SetTrustedProxies(nil) // SEC-001: Disallow proxy header trust
	router.Use(limiter.Middleware())
	router.GET("/protected-limit", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// Request 1 with spoofed IP
	req1, _ := http.NewRequest(http.MethodGet, "/protected-limit", nil)
	req1.Header.Set("X-Forwarded-For", "1.1.1.1")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w1.Code)
	}

	// Request 2 with another spoofed IP
	req2, _ := http.NewRequest(http.MethodGet, "/protected-limit", nil)
	req2.Header.Set("X-Forwarded-For", "2.2.2.2")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w2.Code)
	}

	// Request 3 with yet another spoofed IP - since SetTrustedProxies(nil) is in effect,
	// Gin ignores X-Forwarded-For and identifies the client by RemoteAddr, triggering 429!
	req3, _ := http.NewRequest(http.MethodGet, "/protected-limit", nil)
	req3.Header.Set("X-Forwarded-For", "3.3.3.3")
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Fatalf("expected rate limit 429 despite spoofed X-Forwarded-For, got %d", w3.Code)
	}
}

func TestAuthMiddleware_DeactivatedUserRevocation(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:      "test-secret-key-32-bytes-minimum!",
		JWTExpiryHours: 1,
	}

	userRepo := repository.NewUserMemoryRepository()
	ctx := context.Background()

	user := &models.User{
		ID:           primitive.NewObjectID(),
		Name:         "Revoked Employee",
		Email:        "revoked@stockflow.test",
		PasswordHash: "dummyhash",
		Role:         models.RoleWarehouseStaff,
		IsActive:     true,
	}
	_ = userRepo.Create(ctx, user)

	token, _, err := utils.GenerateJWT(user, cfg.JWTSecret, cfg.JWTExpiryHours)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	router := gin.New()
	router.Use(AuthMiddleware(cfg, userRepo))
	router.GET("/protected-op", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// 1. Initial request with active user succeeds
	req1, _ := http.NewRequest(http.MethodGet, "/protected-op", nil)
	req1.Header.Set("Authorization", "Bearer "+token)
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 for active user, got %d", w1.Code)
	}

	// 2. Admin deactivates user
	user.IsActive = false
	_ = userRepo.Update(ctx, user)

	// 3. Subsequent request with the same token is revoked immediately
	req2, _ := http.NewRequest(http.MethodGet, "/protected-op", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for deactivated user, got %d", w2.Code)
	}
}
