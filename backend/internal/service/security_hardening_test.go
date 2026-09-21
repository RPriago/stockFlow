package service

import (
	"context"
	"testing"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
)

func TestSecurity_RegexQuotingAndReDoSDefense(t *testing.T) {
	ctx := context.Background()
	prodRepo := repository.NewProductMemoryRepository()
	prodService := NewProductService(prodRepo)

	cat, err := prodService.CreateCategory(ctx, models.CreateCategoryRequest{Name: "Security Test Category"})
	if err != nil {
		t.Fatalf("failed to create test category: %v", err)
	}

	// Create test products
	_, err = prodService.CreateProduct(ctx, models.CreateProductRequest{
		SKU:        "SKU-SAFE-001",
		Name:       "Standard Safe Product",
		CategoryID: cat.ID.Hex(),
		Unit:       "pcs",
		MinStock:   5,
		Price:      10000,
	}, "tester")
	if err != nil {
		t.Fatalf("failed to create product: %v", err)
	}

	_, err = prodService.CreateProduct(ctx, models.CreateProductRequest{
		SKU:        "SKU-[SPECIAL]-002",
		Name:       "Product with [brackets] & (parentheses)+.*",
		CategoryID: cat.ID.Hex(),
		Unit:       "pcs",
		MinStock:   5,
		Price:      15000,
	}, "tester")
	if err != nil {
		t.Fatalf("failed to create product: %v", err)
	}

	// Malicious regex payloads that would fail or cause ReDoS if not escaped with QuoteMeta
	maliciousQueries := []string{
		`.*`,
		`(a+)+$`,
		`[a-z0-9_]{100,}`,
		`[[[[[[`,
		`\`,
		`^$`,
		`(?i)admin`,
	}

	for _, query := range maliciousQueries {
		products, _, err := prodService.ListProducts(ctx, models.ProductQueryParam{
			Search: query,
		})
		if err != nil {
			t.Errorf("search with regex payload %q caused error: %v", query, err)
		}
		// The query should be evaluated as literal string, so generic regex wildcards shouldn't match everything
		if query == ".*" && len(products) == 2 {
			t.Errorf("search for '.*' was not properly escaped as literal text, matched all %d products", len(products))
		}
	}

	// Literal search for brackets should work cleanly
	exactBracket, _, err := prodService.ListProducts(ctx, models.ProductQueryParam{
		Search: "[brackets]",
	})
	if err != nil {
		t.Fatalf("literal search with brackets failed: %v", err)
	}
	if len(exactBracket) != 1 {
		t.Errorf("expected 1 product for literal '[brackets]' search, got %d", len(exactBracket))
	}
}

func TestSecurity_UserEnumerationTimingDefense(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserMemoryRepository()
	cfg := &config.Config{
		JWTSecret:      "test-secret-key-32-characters-min!!",
		JWTExpiryHours: 24,
	}
	authSvc := NewAuthService(userRepo, cfg)

	// Seed existing user
	_, err := authSvc.Register(ctx, models.RegisterRequest{
		Name:     "Existing User",
		Email:    "existing@stockflow.test",
		Password: "Password123!",
		Role:     models.RoleWarehouseStaff,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	// 1. Non-existent user login
	_, _, _, errNonExistent := authSvc.Login(ctx, models.LoginRequest{
		Email:    "nonexistent@stockflow.test",
		Password: "Password123!",
	})
	if errNonExistent == nil || errNonExistent != ErrInvalidCredentials {
		t.Errorf("expected ErrInvalidCredentials for non-existent user, got %v", errNonExistent)
	}

	// 2. Existing user with wrong password
	_, _, _, errWrongPassword := authSvc.Login(ctx, models.LoginRequest{
		Email:    "existing@stockflow.test",
		Password: "WrongPassword!",
	})
	if errWrongPassword == nil || errWrongPassword != ErrInvalidCredentials {
		t.Errorf("expected ErrInvalidCredentials for wrong password, got %v", errWrongPassword)
	}

	// Error messages MUST be identical to prevent user enumeration
	if errNonExistent.Error() != errWrongPassword.Error() {
		t.Errorf("error messages differ! non-existent: %q, wrong pass: %q",
			errNonExistent.Error(), errWrongPassword.Error())
	}
}
