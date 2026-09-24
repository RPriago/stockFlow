package middleware

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

type BlockChecker interface {
	IsClientBlocked(clientIP, deviceID string) (bool, string, time.Duration)
}

// ClientBlockMiddleware intercepts incoming requests and immediately rejects
// any client whose IP network or device identifier has been blocked due to excessive failed logins.
func ClientBlockMiddleware(checker BlockChecker) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := utils.GetClientIP(c)
		deviceID := utils.GetDeviceID(c)

		if blocked, reason, retryAfter := checker.IsClientBlocked(clientIP, deviceID); blocked {
			retrySec := int(retryAfter.Seconds())
			if retrySec < 1 {
				retrySec = 1
			}
			c.Header("Retry-After", strconv.Itoa(retrySec))
			mins := int(retryAfter.Minutes()) + 1
			var msg string
			if mins <= 1 {
				msg = fmt.Sprintf("Access temporarily blocked due to excessive failed login attempts from this %s. Try again in 1 minute.", reason)
			} else {
				msg = fmt.Sprintf("Access temporarily blocked due to excessive failed login attempts from this %s. Try again in %d minutes.", reason, mins)
			}
			utils.ErrorResponse(c, http.StatusTooManyRequests, msg, nil)
			c.Abort()
			return
		}

		c.Next()
	}
}
