package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// isOriginAllowed validates whether an Origin or Referer host matches approved StockFlow domains.
func isOriginAllowed(origin string, cfg *config.Config) bool {
	if origin == "" {
		return false
	}

	// Normalize origin URL
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	normalized := parsed.Scheme + "://" + parsed.Host

	if normalized == cfg.FrontendURL ||
		normalized == "http://localhost:3000" ||
		normalized == "http://127.0.0.1:3000" ||
		normalized == "https://stock-flow-brown.vercel.app" {
		return true
	}

	// Allow preview branch deployments
	if parsed.Scheme == "https" &&
		strings.HasPrefix(parsed.Host, "stock-flow-") &&
		strings.HasSuffix(parsed.Host, ".vercel.app") {
		return true
	}

	return false
}

// CSRFProtectionMiddleware protects state-changing endpoints (POST, PUT, DELETE, PATCH)
// against Cross-Site Request Forgery via Origin/Referer verification, custom header
// enforcement, and form-post prevention.
func CSRFProtectionMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method

		// Safe HTTP methods do not mutate state
		if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
			c.Next()
			return
		}

		// 1. Prohibit standard HTML form submissions on JSON APIs (common CSRF attack vector)
		contentType := c.GetHeader("Content-Type")
		if strings.HasPrefix(contentType, "application/x-www-form-urlencoded") ||
			strings.HasPrefix(contentType, "multipart/form-data") ||
			strings.HasPrefix(contentType, "text/plain") {
			utils.ErrorResponse(c, http.StatusUnsupportedMediaType, "HTML form content types are not supported. Use application/json.", nil)
			c.Abort()
			return
		}

		// 2. Validate Origin / Referer header if present (browser requests will always have at least one)
		origin := c.GetHeader("Origin")
		if origin != "" {
			if !isOriginAllowed(origin, cfg) {
				utils.ErrorResponse(c, http.StatusForbidden, "Cross-origin request rejected by CSRF protection", nil)
				c.Abort()
				return
			}
		} else {
			referer := c.GetHeader("Referer")
			if referer != "" {
				if !isOriginAllowed(referer, cfg) {
					utils.ErrorResponse(c, http.StatusForbidden, "Invalid request referer rejected by CSRF protection", nil)
					c.Abort()
					return
				}
			}
		}

		// 3. Custom Header / Token Verification:
		// Standard cross-site HTML forms cannot set custom headers ('Authorization' or 'X-Requested-With').
		// Presence of either confirms the request originates from programmatic JavaScript with CORS preflight.
		authHeader := c.GetHeader("Authorization")
		xRequestedWith := c.GetHeader("X-Requested-With")

		// If this is a login/register request, token is not present yet, but X-Requested-With or Content-Type=application/json is required
		isAuthRoute := strings.HasPrefix(c.Request.URL.Path, "/api/v1/auth/")

		if !isAuthRoute && authHeader == "" && xRequestedWith == "" {
			// Fallback: check if valid cookie exists. If request has only cookie but neither Origin nor custom header, reject
			if cookie, err := c.Cookie(CookieName); err == nil && cookie != "" && origin == "" {
				utils.ErrorResponse(c, http.StatusForbidden, "Missing required CSRF verification header", nil)
				c.Abort()
				return
			}
		}

		c.Next()
	}
}
