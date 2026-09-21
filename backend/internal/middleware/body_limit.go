package middleware

import (
	"net/http"

	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// BodyLimitMiddleware restricts the maximum allowed request body size to protect
// against Denial of Service (DoS) memory exhaustion attacks via oversized JSON payloads.
func BodyLimitMiddleware(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Fast rejection if Content-Length header already exceeds limit
		if c.Request.ContentLength > maxBytes {
			utils.ErrorResponse(c, http.StatusRequestEntityTooLarge, "Request payload exceeds maximum allowed size (2 MB)", nil)
			c.Abort()
			return
		}

		// 2. Wrap body stream with MaxBytesReader to protect against chunked transfer or forged headers
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}

		c.Next()
	}
}
