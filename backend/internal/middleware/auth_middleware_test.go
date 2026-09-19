package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/config"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/utils"
)

func TestRequireRoles(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		userRole       models.Role
		allowedRoles   []models.Role
		expectedStatus int
	}{
		{
			name:           "Super Admin allowed on Super Admin endpoint",
			userRole:       models.RoleSuperAdmin,
			allowedRoles:   []models.Role{models.RoleSuperAdmin},
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Staff forbidden on Manager endpoint",
			userRole:       models.RoleWarehouseStaff,
			allowedRoles:   []models.Role{models.RoleSuperAdmin, models.RoleWarehouseManager},
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "Manager allowed on Manager endpoint",
			userRole:       models.RoleWarehouseManager,
			allowedRoles:   []models.Role{models.RoleSuperAdmin, models.RoleWarehouseManager},
			expectedStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.Use(func(c *gin.Context) {
				c.Set(ContextRole, tc.userRole)
				c.Next()
			})
			r.GET("/test-role", RequireRoles(tc.allowedRoles...), func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"status": "ok"})
			})

			req, _ := http.NewRequest(http.MethodGet, "/test-role", nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tc.expectedStatus {
				t.Errorf("Expected status %d, got %d", tc.expectedStatus, w.Code)
			}
		})
	}
}

func TestAuthMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		JWTSecret: "test-auth-secret",
	}

	r := gin.New()
	r.Use(AuthMiddleware(cfg))
	r.GET("/protected", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"user_id": c.GetString(ContextUserID)})
	})

	// 1. Without token -> 401 Unauthorized
	req1, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized, got %d", w1.Code)
	}

	// 2. With valid Bearer token -> 200 OK
	dummyUser := &models.User{
		ID:    primitive.NewObjectID(),
		Name:  "Staff Member",
		Email: "staff@stockflow.com",
		Role:  models.RoleWarehouseStaff,
	}
	token, _, err := utils.GenerateJWT(dummyUser, cfg.JWTSecret, 1)
	if err != nil {
		t.Fatalf("Failed to generate test token: %v", err)
	}

	req2, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("Expected 200 OK with Bearer token, got %d", w2.Code)
	}

	// 3. With valid Cookie -> 200 OK
	req3, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req3.AddCookie(&http.Cookie{
		Name:  CookieName,
		Value: token,
	})
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Errorf("Expected 200 OK with Cookie, got %d", w3.Code)
	}
}
