package handler

import (
	"errors"
	"net/http"
	"strconv"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/middleware"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AuthHandler struct {
	authService service.AuthService
	cfg         *config.Config
}

func NewAuthHandler(authService service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		cfg:         cfg,
	}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	user, token, expiresAt, err := h.authService.Login(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid email or password", nil)
			return
		}
		if errors.Is(err, service.ErrAccountInactive) {
			utils.ErrorResponse(c, http.StatusForbidden, "Account is disabled. Contact administrator", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to authenticate", err.Error())
		return
	}

	// Set HTTP-only Cookie
	cookieMaxAge := h.cfg.JWTExpiryHours * 3600
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		middleware.CookieName,
		token,
		cookieMaxAge,
		"/",
		h.cfg.CookieDomain,
		h.cfg.CookieSecure,
		true, // HttpOnly
	)

	utils.SuccessResponse(c, http.StatusOK, "Login successful", gin.H{
		"user":       user.ToResponse(),
		"token":      token,
		"expires_at": expiresAt,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	// Clear HTTP-only Cookie
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		middleware.CookieName,
		"",
		-1,
		"/",
		h.cfg.CookieDomain,
		h.cfg.CookieSecure,
		true,
	)

	utils.SuccessResponse(c, http.StatusOK, "Logged out successfully", nil)
}

func (h *AuthHandler) GetMe(c *gin.Context) {
	userIDStr, exists := c.Get(middleware.ContextUserID)
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "User context not found", nil)
		return
	}

	userID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid user ID format", nil)
		return
	}

	user, err := h.authService.GetCurrentUser(c.Request.Context(), userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "User not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve user profile", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Current user retrieved", user.ToResponse())
}

func (h *AuthHandler) RegisterUser(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	createdUser, err := h.authService.Register(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, repository.ErrUserAlreadyExists) {
			utils.ErrorResponse(c, http.StatusConflict, "User with this email already exists", nil)
			return
		}
		if errors.Is(err, service.ErrInvalidRole) {
			utils.ErrorResponse(c, http.StatusBadRequest, "Invalid user role specified", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to register user", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "User created successfully", createdUser.ToResponse())
}

func (h *AuthHandler) ListUsers(c *gin.Context) {
	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "10"), 10, 64)

	users, total, err := h.authService.ListUsers(c.Request.Context(), page, limit)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch users", err.Error())
		return
	}
	if users == nil {
		users = []models.UserResponse{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Users fetched successfully", gin.H{
		"users": users,
		"meta": gin.H{
			"total": total,
			"page":  page,
			"limit": limit,
		},
	})
}
