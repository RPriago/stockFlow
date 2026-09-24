package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type mockBlockChecker struct {
	blockedIP     string
	blockedDevice string
}

func (m *mockBlockChecker) IsClientBlocked(clientIP, deviceID string) (bool, string, time.Duration) {
	if m.blockedIP != "" && clientIP == m.blockedIP {
		return true, "network", 15 * time.Minute
	}
	if m.blockedDevice != "" && deviceID == m.blockedDevice {
		return true, "device", 15 * time.Minute
	}
	return false, "", 0
}

func TestClientBlockMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	checker := &mockBlockChecker{
		blockedIP:     "198.51.100.55",
		blockedDevice: "device-blocked-uuid",
	}

	router := gin.New()
	router.Use(ClientBlockMiddleware(checker))
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	t.Run("Clean client is allowed", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("X-Device-ID", "device-clean")
		req.Header.Set("CF-Connecting-IP", "198.51.100.1")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200 OK, got %d", w.Code)
		}
	})

	t.Run("Blocked IP is rejected with 429", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("X-Device-ID", "device-clean")
		req.Header.Set("CF-Connecting-IP", "198.51.100.55")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusTooManyRequests {
			t.Errorf("expected 429 Too Many Requests, got %d", w.Code)
		}
		if retry := w.Header().Get("Retry-After"); retry == "" {
			t.Error("expected Retry-After header to be present")
		}
	})

	t.Run("Blocked Device is rejected with 429", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("X-Device-ID", "device-blocked-uuid")
		req.Header.Set("CF-Connecting-IP", "198.51.100.1") // clean IP, but blocked device
		router.ServeHTTP(w, req)

		if w.Code != http.StatusTooManyRequests {
			t.Errorf("expected 429 Too Many Requests, got %d", w.Code)
		}
	})
}
