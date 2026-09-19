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

func setupPORouter() (*gin.Engine, *models.Supplier, *models.Product, *models.Warehouse, *models.Location) {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	poRepo := repository.NewMemoryPORepository()
	productRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()
	invRepo := repository.NewMemoryInventoryRepository()

	ctx := context.Background()

	// Seed product
	prod := &models.Product{
		ID:        primitive.NewObjectID(),
		SKU:       "SKU-PO-TEST-01",
		Name:      "Heavy Duty Forklift Battery",
		Unit:      "pcs",
		CostPrice: 4500000,
	}
	_ = productRepo.CreateProduct(ctx, prod)

	// Seed warehouse & location
	wh := &models.Warehouse{
		ID:       primitive.NewObjectID(),
		Code:     "WH-SBY-01",
		Name:     "Surabaya Hub",
		City:     "Surabaya",
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

	// Seed supplier
	sup := &models.Supplier{
		ID:       primitive.NewObjectID(),
		Code:     "SUP-IND-01",
		Name:     "PT Supplier Industri",
		Email:    "info@supplier.com",
		IsActive: true,
	}
	_ = poRepo.CreateSupplier(ctx, sup)

	invService := service.NewInventoryService(invRepo, productRepo, whRepo)
	poService := service.NewPOService(poRepo, productRepo, whRepo, invService)
	poHandler := handler.NewPOHandler(poService)

	router.Use(func(c *gin.Context) {
		c.Set("current_user_id", "admin-1")
		c.Set("current_user_name", "Test Admin")
		c.Set("current_user_role", models.RoleSuperAdmin)
		c.Next()
	})

	v1 := router.Group("/api/v1")
	{
		supGroup := v1.Group("/suppliers")
		{
			supGroup.GET("", poHandler.ListSuppliers)
			supGroup.POST("", poHandler.CreateSupplier)
		}
		poGroup := v1.Group("/purchase-orders")
		{
			poGroup.GET("", poHandler.ListPOs)
			poGroup.GET("/stats", poHandler.GetPOStats)
			poGroup.POST("", poHandler.CreatePO)
			poGroup.POST("/:id/order", poHandler.MarkOrdered)
			poGroup.POST("/:id/receive", poHandler.ReceivePO)
		}
	}

	return router, sup, prod, wh, loc
}

func TestPOHandlerEndpoints(t *testing.T) {
	router, sup, prod, wh, loc := setupPORouter()

	// 1. Test GET /suppliers
	req := httptest.NewRequest(http.MethodGet, "/api/v1/suppliers", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for suppliers, got %d", w.Code)
	}

	// 2. Test POST /purchase-orders
	poBody, _ := json.Marshal(models.CreatePORequest{
		SupplierID:  sup.ID.Hex(),
		WarehouseID: wh.ID.Hex(),
		Items: []models.CreatePOItemRequest{
			{ProductID: prod.ID.Hex(), QuantityOrdered: 10, UnitCost: 4500000},
		},
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/purchase-orders", bytes.NewBuffer(poBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201 Created for PO, got %d: %s", w.Code, w.Body.String())
	}

	var res struct {
		Data models.PurchaseOrder `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	createdPOID := res.Data.ID.Hex()

	// 3. Test POST /purchase-orders/:id/order
	req = httptest.NewRequest(http.MethodPost, "/api/v1/purchase-orders/"+createdPOID+"/order", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for mark ordered, got %d: %s", w.Code, w.Body.String())
	}

	// 4. Test POST /purchase-orders/:id/receive
	recvBody, _ := json.Marshal(models.ReceivePORequest{
		Items: []models.ReceiveItemPayload{
			{ProductID: prod.ID.Hex(), LocationID: loc.ID.Hex(), QuantityReceived: 10},
		},
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/purchase-orders/"+createdPOID+"/receive", bytes.NewBuffer(recvBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for receive, got %d: %s", w.Code, w.Body.String())
	}
}
