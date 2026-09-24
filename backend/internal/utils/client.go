package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

// GetClientIP extracts the real client IP, inspecting Cloudflare and standard proxy headers safely.
func GetClientIP(c *gin.Context) string {
	if cfIP := strings.TrimSpace(c.GetHeader("CF-Connecting-IP")); cfIP != "" {
		if ip := net.ParseIP(cfIP); ip != nil {
			return cfIP
		}
	}
	if realIP := strings.TrimSpace(c.GetHeader("X-Real-IP")); realIP != "" {
		if ip := net.ParseIP(realIP); ip != nil {
			return realIP
		}
	}
	clientIP := c.ClientIP()
	if clientIP == "" {
		clientIP = "unknown"
	}
	return clientIP
}

// GetDeviceID retrieves the persistent device identifier from the request header, cookie,
// or generates a deterministic fallback fingerprint from client characteristics.
func GetDeviceID(c *gin.Context) string {
	// 1. Check custom X-Device-ID header (sent by frontend)
	if devID := strings.TrimSpace(c.GetHeader("X-Device-ID")); devID != "" {
		return devID
	}

	// 2. Check stockflow_device_id cookie
	if cookie, err := c.Cookie("stockflow_device_id"); err == nil && strings.TrimSpace(cookie) != "" {
		return strings.TrimSpace(cookie)
	}

	// 3. Fallback: Generate cryptographic fingerprint from client headers
	ua := c.Request.UserAgent()
	lang := c.GetHeader("Accept-Language")
	secUA := c.GetHeader("Sec-CH-UA")
	raw := ua + "|" + lang + "|" + secUA

	hash := sha256.Sum256([]byte(raw))
	return "fp-" + hex.EncodeToString(hash[:16])
}
