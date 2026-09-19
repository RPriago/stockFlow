package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/config"
	"stockflow-backend/internal/handler"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
)

func setupTestRouter() (*gin.Engine, *models.Product, *models.Warehouse, *models.Location) {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	cfg := &config.Config{
		JWTSecret: "test-secret-key-1234567890",
	}

	invRepo := repository.NewMemoryInventoryRepository()
	prodRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()

	ctx := context.Background()

	// Seed product
	prod := &models.Product{
		ID:       primitive.NewObjectID(),
		SKU:      "SKU-TEST-01",
		Name:     "Wireless Ergonomic Mouse",
		Unit:     "pcs",
		MinStock: 5,
	}
	_ = prodRepo.CreateProduct(ctx, prod)

	// Seed warehouse & location
	wh := &models.Warehouse{
		ID:       primitive.NewObjectID(),
		Code:     "WH-TEST",
		Name:     "Test Hub",
		City:     "Jakarta",
		Capacity: 1000,
	}
	_ = whRepo.CreateWarehouse(ctx, wh)

	loc := &models.Location{
		ID:          primitive.NewObjectID(),
		WarehouseID: wh.ID,
		Code:        "A-01-01-A",
		Zone:        "Zone A",
		Rack:        "01",
		Shelf:       "01",
		Bin:         "A",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 50,
	}
	_ = whRepo.CreateLocation(ctx, loc)

	invService := service.NewInventoryService(invRepo, prodRepo, whRepo)
	invHandler := handler.NewInventoryHandler(invService)

	// Mock auth context for testing
	router.Use(func(c *gin.Context) {
		c.Set("current_user_id", "test-user-id")
		c.Set("current_user_name", "Test Admin")
		c.Set("current_user_role", models.RoleSuperAdmin)
		c.Next()
	})

	v1 := router.Group("/api/v1/inventory")
	{
		v1.GET("", invHandler.ListInventory)
		v1.GET("/stats", invHandler.GetStats)
		v1.GET("/movements", invHandler.ListMovements)
		v1.POST("/stock-in", invHandler.StockIn)
		v1.POST("/stock-out", invHandler.StockOut)
		v1.POST("/adjust", invHandler.AdjustStock)
	}

	_ = cfg
	return router, prod, wh, loc
}

func TestInventoryAPIEndpoints(t *testing.T) {
	router, prod, wh, loc := setupTestRouter()

	// 1. Test POST /stock-in
	stockInBody, _ := json.Marshal(models.StockInRequest{
		ProductID:     prod.ID.Hex(),
		WarehouseID:   wh.ID.Hex(),
		LocationID:    loc.ID.Hex(),
		Quantity:      30,
		ReferenceType: "po",
		ReferenceID:   "PO-TEST-001",
		Notes:         "Test intake",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/inventory/stock-in", bytes.NewBuffer(stockInBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	// 2. Test GET /stats
	req = httptest.NewRequest(http.MethodGet, "/api/v1/inventory/stats", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for stats, got %d: %s", w.Code, w.Body.String())
	}

	// 3. Test POST /stock-out
	stockOutBody, _ := json.Marshal(models.StockOutRequest{
		ProductID:     prod.ID.Hex(),
		WarehouseID:   wh.ID.Hex(),
		LocationID:    loc.ID.Hex(),
		Quantity:      10,
		ReferenceType: "so",
		ReferenceID:   "SO-TEST-001",
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/inventory/stock-out", bytes.NewBuffer(stockOutBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for stock out, got %d: %s", w.Code, w.Body.String())
	}

	// 4. Test Overdraft Stock-out (attempt 50 when only 20 left)
	overdraftBody, _ := json.Marshal(models.StockOutRequest{
		ProductID:   prod.ID.Hex(),
		WarehouseID: wh.ID.Hex(),
		LocationID:  loc.ID.Hex(),
		Quantity:    50,
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/inventory/stock-out", bytes.NewBuffer(overdraftBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected status 409 Conflict on overdraft, got %d: %s", w.Code, w.Body.String())
	}

	// 5. Test POST /adjust
	adjustBody, _ := json.Marshal(models.StockAdjustmentRequest{
		ProductID:      prod.ID.Hex(),
		WarehouseID:    wh.ID.Hex(),
		LocationID:     loc.ID.Hex(),
		ActualQuantity: 25,
		Reason:         "Test adjustment reconciliation",
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/inventory/adjust", bytes.NewBuffer(adjustBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for adjust, got %d: %s", w.Code, w.Body.String())
	}

	// 6. Test GET /movements
	req = httptest.NewRequest(http.MethodGet, "/api/v1/inventory/movements", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for movements, got %d: %s", w.Code, w.Body.String())
	}
}
