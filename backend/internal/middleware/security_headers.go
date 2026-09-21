package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// SecurityHeadersMiddleware injects OWASP recommended HTTP security headers
// to protect against XSS, Clickjacking, MIME-sniffing, and context-leakage.
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()

		// 1. Prevent MIME-sniffing
		h.Set("X-Content-Type-Options", "nosniff")

		// 2. Prevent Clickjacking (framing attacks)
		h.Set("X-Frame-Options", "DENY")

		// 3. Enable legacy browser XSS filters
		h.Set("X-XSS-Protection", "1; mode=block")

		// 4. Restrict Referrer leakage across origins
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// 5. Restrict sensitive device APIs
		h.Set("Permissions-Policy", "geolocation=(), camera=(), microphone=()")

		// 6. Content-Security-Policy: default self, block framing
		h.Set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none';")

		// 7. Strict-Transport-Security (HSTS) when running on HTTPS or behind TLS-terminating reverse proxy (e.g. Render/Cloudflare)
		if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		c.Next()
	}
}
