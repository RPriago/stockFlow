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
	"stockflow-backend/internal/handler"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
)

func setupSORouter() (*gin.Engine, *models.Customer, *models.Product, *models.Warehouse, *models.Location) {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	soRepo := repository.NewMemorySORepository()
	productRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()
	invRepo := repository.NewMemoryInventoryRepository()

	ctx := context.Background()

	// Seed product
	prod := &models.Product{
		ID:        primitive.NewObjectID(),
		SKU:       "SKU-SO-TEST-01",
		Name:      "Logistics Scanner Barcode",
		Unit:      "pcs",
		CostPrice: 2000000,
		Price:     3500000,
	}
	_ = productRepo.CreateProduct(ctx, prod)

	// Seed warehouse & location
	wh := &models.Warehouse{
		ID:       primitive.NewObjectID(),
		Code:     "WH-TEST-01",
		Name:     "Distribution Hub A",
		City:     "Jakarta",
		Capacity: 5000,
	}
	_ = whRepo.CreateWarehouse(ctx, wh)

	loc := &models.Location{
		ID:          primitive.NewObjectID(),
		WarehouseID: wh.ID,
		Code:        "A-01-01-A",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 100,
	}
	_ = whRepo.CreateLocation(ctx, loc)

	// Seed customer
	cust := &models.Customer{
		ID:       primitive.NewObjectID(),
		Code:     "CUST-001",
		Name:     "PT Mitra Sejahtera",
		Email:    "sales@mitra.com",
		Phone:    "021-123456",
		Address:  "Jl. Thamrin No. 1",
		City:     "Jakarta",
		IsActive: true,
	}
	_ = soRepo.CreateCustomer(ctx, cust)

	invService := service.NewInventoryService(invRepo, productRepo, whRepo)
	soService := service.NewSOService(soRepo, productRepo, whRepo, invService)
	soHandler := handler.NewSOHandler(soService)

	v1 := router.Group("/api/v1")
	{
		custGroup := v1.Group("/customers")
		{
			custGroup.GET("", soHandler.ListCustomers)
			custGroup.POST("", soHandler.CreateCustomer)
			custGroup.GET("/:id", soHandler.GetCustomerByID)
		}

		soGroup := v1.Group("/sales-orders")
		{
			soGroup.GET("", soHandler.ListSOs)
			soGroup.GET("/stats", soHandler.GetSOStats)
			soGroup.GET("/:id", soHandler.GetSOByID)
			soGroup.POST("", soHandler.CreateSO)
			soGroup.POST("/:id/confirm", soHandler.ConfirmSO)
		}
	}

	return router, cust, prod, wh, loc
}

func TestSOHandlerEndpoints(t *testing.T) {
	router, cust, prod, wh, loc := setupSORouter()

	// 1. Test GET /api/v1/customers
	req, _ := http.NewRequest("GET", "/api/v1/customers", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list customers, got %d", w.Code)
	}

	// 2. Test POST /api/v1/sales-orders
	payload := models.CreateSORequest{
		CustomerID:      cust.ID.Hex(),
		WarehouseID:     wh.ID.Hex(),
		ShippingAddress: "Jl. Sudirman 10, Jakarta",
		Notes:           "Deliver ASAP",
		Items: []models.CreateSOItemRequest{
			{
				ProductID:       prod.ID.Hex(),
				LocationID:      loc.ID.Hex(),
				QuantityOrdered: 5,
				UnitPrice:       3500000,
			},
		},
	}
	body, _ := json.Marshal(payload)
	req, _ = http.NewRequest("POST", "/api/v1/sales-orders", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for CreateSO, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool               `json:"success"`
		Data    models.SalesOrder  `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.OrderNumber[:3] != "SO-" {
		t.Errorf("expected order number prefix SO-, got %s", resp.Data.OrderNumber)
	}

	// 3. Test GET /api/v1/sales-orders/stats
	req, _ = http.NewRequest("GET", "/api/v1/sales-orders/stats", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 OK for stats, got %d", w.Code)
	}

	// 4. Test GET /api/v1/sales-orders with pagination
	req, _ = http.NewRequest("GET", "/api/v1/sales-orders?page=1&limit=10", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 OK for list SOs, got %d", w.Code)
	}
}
