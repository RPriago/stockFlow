package middleware

import (
	"net/http"
	"strings"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	CookieName    = "stockflow_token"
	ContextUserID = "current_user_id"
	ContextRole   = "current_user_role"
	ContextEmail  = "current_user_email"
	ContextName   = "current_user_name"
)

func AuthMiddleware(cfg *config.Config, userRepos ...repository.UserRepository) gin.HandlerFunc {
	var userRepo repository.UserRepository
	if len(userRepos) > 0 {
		userRepo = userRepos[0]
	}
	return func(c *gin.Context) {
		var tokenString string

		// 1. Try reading token from HTTP-only Cookie
		if cookie, err := c.Cookie(CookieName); err == nil && cookie != "" {
			tokenString = cookie
		}

		// 2. Fallback to Authorization: Bearer header (for Postman / API testing)
		if tokenString == "" {
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		// 3. Fallback to query param (strictly restricted to EventSource SSE streaming at /events to prevent token log leakage)
		if tokenString == "" && strings.HasSuffix(c.Request.URL.Path, "/events") {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			utils.ErrorResponse(c, http.StatusUnauthorized, "Authentication token required", nil)
			c.Abort()
			return
		}

		claims, err := utils.ValidateJWT(tokenString, cfg.JWTSecret)
		if err != nil {
			utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid or expired token", err.Error())
			c.Abort()
			return
		}

		// SEC-004: Token revocation check - ensure account is active and not deleted
		if userRepo != nil {
			userOID, err := primitive.ObjectIDFromHex(claims.UserID)
			if err != nil {
				utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid user identifier in token", nil)
				c.Abort()
				return
			}
			user, err := userRepo.FindByID(c.Request.Context(), userOID)
			if err != nil || user == nil || !user.IsActive {
				utils.ErrorResponse(c, http.StatusUnauthorized, "User account is inactive or revoked", nil)
				c.Abort()
				return
			}
		}

		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextEmail, claims.Email)
		c.Set(ContextRole, claims.Role)
		c.Set(ContextName, claims.Name)

		c.Next()
	}
}

func RequireRoles(allowedRoles ...models.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleVal, exists := c.Get(ContextRole)
		if !exists {
			utils.ErrorResponse(c, http.StatusForbidden, "Unauthorized access: role not defined", nil)
			c.Abort()
			return
		}

		userRole, ok := roleVal.(models.Role)
		if !ok {
			utils.ErrorResponse(c, http.StatusForbidden, "Unauthorized access: invalid role format", nil)
			c.Abort()
			return
		}

		for _, role := range allowedRoles {
			if userRole == role {
				c.Next()
				return
			}
		}

		utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: you do not have permission to perform this action", gin.H{
			"required_roles": allowedRoles,
			"current_role":   userRole,
		})
		c.Abort()
	}
}
