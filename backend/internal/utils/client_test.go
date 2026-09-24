package utils

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestGetClientIP(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		headers    map[string]string
		remoteAddr string
		expectedIP string
	}{
		{
			name: "CF-Connecting-IP takes highest priority",
			headers: map[string]string{
				"CF-Connecting-IP": "203.0.113.195",
				"X-Real-IP":        "198.51.100.22",
			},
			remoteAddr: "10.0.0.1:12345",
			expectedIP: "203.0.113.195",
		},
		{
			name: "X-Real-IP used when CF-Connecting-IP absent",
			headers: map[string]string{
				"X-Real-IP": "198.51.100.22",
			},
			remoteAddr: "10.0.0.1:12345",
			expectedIP: "198.51.100.22",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			req, _ := http.NewRequest(http.MethodGet, "/test", nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			req.RemoteAddr = tt.remoteAddr
			c.Request = req

			ip := GetClientIP(c)
			if ip != tt.expectedIP {
				t.Errorf("GetClientIP() = %v, want %v", ip, tt.expectedIP)
			}
		})
	}
}

func TestGetDeviceID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("Extracts from X-Device-ID header", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("X-Device-ID", "device-custom-uuid-1234")
		c.Request = req

		deviceID := GetDeviceID(c)
		if deviceID != "device-custom-uuid-1234" {
			t.Errorf("GetDeviceID() = %v, want device-custom-uuid-1234", deviceID)
		}
	})

	t.Run("Extracts from stockflow_device_id cookie", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.AddCookie(&http.Cookie{
			Name:  "stockflow_device_id",
			Value: "cookie-device-5678",
		})
		c.Request = req

		deviceID := GetDeviceID(c)
		if deviceID != "cookie-device-5678" {
			t.Errorf("GetDeviceID() = %v, want cookie-device-5678", deviceID)
		}
	})

	t.Run("Generates deterministic fallback fingerprint when no header or cookie", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 TestBrowser")
		req.Header.Set("Accept-Language", "en-US,en;q=0.9")
		c.Request = req

		deviceID1 := GetDeviceID(c)
		deviceID2 := GetDeviceID(c)

		if deviceID1 == "" || len(deviceID1) < 10 {
			t.Fatalf("expected non-empty fingerprint, got %q", deviceID1)
		}
		if deviceID1 != deviceID2 {
			t.Errorf("fingerprint not deterministic: %v vs %v", deviceID1, deviceID2)
		}
	})
}
