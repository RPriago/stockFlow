package middleware

import (
	"strings"
	"time"

	"stockflow-backend/internal/config"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORSMiddleware(cfg *config.Config) gin.HandlerFunc {
	corsConfig := cors.Config{
		AllowOriginFunc: func(origin string) bool {
			// Allow exact FRONTEND_URL or local development
			if origin == cfg.FrontendURL || origin == "http://localhost:3000" || origin == "http://127.0.0.1:3000" || origin == "https://stock-flow-brown.vercel.app" {
				return true
			}
			// Allow dedicated preview deployments for this project (stock-flow-*.vercel.app)
			if strings.HasPrefix(origin, "https://stock-flow-") && strings.HasSuffix(origin, ".vercel.app") {
				return true
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length", "Set-Cookie"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}

	return cors.New(corsConfig)
}
