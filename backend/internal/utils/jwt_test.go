package utils

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
)

func TestGenerateAndValidateJWT(t *testing.T) {
	secret := "test-jwt-secret-key-12345"
	user := &models.User{
		ID:    primitive.NewObjectID(),
		Name:  "Test User",
		Email: "test@example.com",
		Role:  models.RoleWarehouseManager,
	}

	token, expiresAt, err := GenerateJWT(user, secret, 2)
	if err != nil {
		t.Fatalf("GenerateJWT returned error: %v", err)
	}

	if token == "" {
		t.Fatalf("Expected token string to be non-empty")
	}

	if expiresAt.Before(time.Now()) {
		t.Errorf("Expiration time should be in the future")
	}

	claims, err := ValidateJWT(token, secret)
	if err != nil {
		t.Fatalf("ValidateJWT returned error: %v", err)
	}

	if claims.UserID != user.ID.Hex() {
		t.Errorf("Expected UserID %s, got %s", user.ID.Hex(), claims.UserID)
	}
	if claims.Email != user.Email {
		t.Errorf("Expected Email %s, got %s", user.Email, claims.Email)
	}
	if claims.Role != user.Role {
		t.Errorf("Expected Role %s, got %s", user.Role, claims.Role)
	}

	// Test with wrong secret
	_, err = ValidateJWT(token, "wrong-secret")
	if err == nil {
		t.Errorf("Expected error when validating with wrong secret, got nil")
	}
}
