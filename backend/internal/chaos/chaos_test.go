package chaos_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/handler"
	"stockflow-backend/internal/middleware"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func setupChaosTestEnvironment() (*gin.Engine, *config.Config, *models.Product, *models.Warehouse, *models.Location, service.InventoryService, service.WarehouseService, service.AuthService, string, string) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(gin.Recovery())

	cfg := &config.Config{
		JWTSecret:      "chaos-test-ultra-secure-key-2026",
		JWTExpiryHours: 24,
	}

	invRepo := repository.NewMemoryInventoryRepository()
	prodRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()
	userRepo := repository.NewUserMemoryRepository()
	poRepo := repository.NewMemoryPORepository()
	soRepo := repository.NewMemorySORepository()
	notifRepo := repository.NewNotificationMemoryRepository()

	ctx := context.Background()

	// 1. Seed Product
	prodID := primitive.NewObjectID()
	prod := &models.Product{
		ID:       prodID,
		SKU:      "CHAOS-PROD-001",
		Name:     "Chaos Test High-Value GPU",
		Unit:     "unit",
		MinStock: 5,
	}
	_ = prodRepo.CreateProduct(ctx, prod)

	// 2. Seed Warehouse & Location
	whID := primitive.NewObjectID()
	wh := &models.Warehouse{
		ID:       whID,
		Code:     "CHAOS-WH-01",
		Name:     "Chaos Main Depot",
		Capacity: 50000,
		IsActive: true,
	}
	_ = whRepo.CreateWarehouse(ctx, wh)

	locID := primitive.NewObjectID()
	loc := &models.Location{
		ID:          locID,
		WarehouseID: whID,
		Code:        "RACK-A1",
		MaxCapacity: 10000,
		IsActive:    true,
	}
	_ = whRepo.CreateLocation(ctx, loc)

	// 3. Seed Users (Super Admin & Staff)
	adminPassHash, _ := utils.HashPassword("AdminPass123!")
	staffPassHash, _ := utils.HashPassword("StaffPass123!")

	adminUser := &models.User{
		ID:           primitive.NewObjectID(),
		Name:         "Super Admin Chaos",
		Email:        "admin@chaos.test",
		PasswordHash: adminPassHash,
		Role:         models.RoleSuperAdmin,
		IsActive:     true,
	}
	_ = userRepo.Create(ctx, adminUser)

	staffUser := &models.User{
		ID:           primitive.NewObjectID(),
		Name:         "Staff Chaos",
		Email:        "staff@chaos.test",
		PasswordHash: staffPassHash,
		Role:         models.RoleWarehouseStaff,
		IsActive:     true,
	}
	_ = userRepo.Create(ctx, staffUser)

	// 4. Initialize Services & Handlers
	authService := service.NewAuthService(userRepo, cfg)
	prodService := service.NewProductService(prodRepo)
	whService := service.NewWarehouseService(whRepo)
	invService := service.NewInventoryService(invRepo, prodRepo, whRepo)
	poService := service.NewPOService(poRepo, prodRepo, whRepo, invService)
	soService := service.NewSOService(soRepo, prodRepo, whRepo, invService)
	notifService := service.NewNotificationService(notifRepo, prodRepo, invRepo)

	authHandler := handler.NewAuthHandler(authService, cfg)
	prodHandler := handler.NewProductHandler(prodService)
	whHandler := handler.NewWarehouseHandler(whService)
	invHandler := handler.NewInventoryHandler(invService)
	poHandler := handler.NewPOHandler(poService)
	soHandler := handler.NewSOHandler(soService)
	notifHandler := handler.NewNotificationHandler(notifService)

	// Generate JWTs
	adminToken, _, _ := utils.GenerateJWT(adminUser, cfg.JWTSecret, cfg.JWTExpiryHours)
	staffToken, _, _ := utils.GenerateJWT(staffUser, cfg.JWTSecret, cfg.JWTExpiryHours)

	// Register Routes
	v1 := router.Group("/api/v1")
	{
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/logout", authHandler.Logout)
			authProtected := authGroup.Group("")
			authProtected.Use(middleware.AuthMiddleware(cfg))
			{
				authProtected.GET("/me", authHandler.GetMe)
			}
		}

		usersGroup := v1.Group("/users")
		usersGroup.Use(middleware.AuthMiddleware(cfg))
		{
			usersGroup.GET("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), authHandler.ListUsers)
			usersGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), authHandler.RegisterUser)
		}

		productsGroup := v1.Group("/products")
		productsGroup.Use(middleware.AuthMiddleware(cfg))
		{
			productsGroup.GET("", prodHandler.ListProducts)
			productsGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), prodHandler.CreateProduct)
		}

		whGroup := v1.Group("/warehouses")
		whGroup.Use(middleware.AuthMiddleware(cfg))
		{
			whGroup.GET("", whHandler.ListWarehouses)
			whGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.CreateWarehouse)
			whGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.DeleteWarehouse)
			whGroup.POST("/:id/locations", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.CreateLocation)
		}

		invGroup := v1.Group("/inventory")
		invGroup.Use(middleware.AuthMiddleware(cfg))
		{
			invGroup.GET("", invHandler.ListInventory)
			invGroup.GET("/analytics/capacity", invHandler.GetWarehouseCapacityAnalytics)
			invGroup.POST("/stock-in", invHandler.StockIn)
			invGroup.POST("/stock-out", invHandler.StockOut)
			invGroup.POST("/adjust", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), invHandler.AdjustStock)
		}

		poGroup := v1.Group("/purchase-orders")
		poGroup.Use(middleware.AuthMiddleware(cfg))
		{
			poGroup.GET("", poHandler.ListPOs)
			poGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.DeletePO)
		}

		soGroup := v1.Group("/sales-orders")
		soGroup.Use(middleware.AuthMiddleware(cfg))
		{
			soGroup.GET("", soHandler.ListSOs)
			soGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.DeleteSO)
		}

		notifGroup := v1.Group("/notifications")
		notifGroup.Use(middleware.AuthMiddleware(cfg))
		{
			notifGroup.GET("", notifHandler.GetNotifications)
		}

		adminGroup := v1.Group("/admin")
		adminGroup.Use(middleware.AuthMiddleware(cfg), middleware.RequireRoles(models.RoleSuperAdmin))
		{
			adminGroup.GET("/diagnostics", func(c *gin.Context) {
				utils.SuccessResponse(c, http.StatusOK, "Super Admin access verified", nil)
			})
		}
	}

	return router, cfg, prod, wh, loc, invService, whService, authService, adminToken, staffToken
}

// -------------------------------------------------------------------------------------------------
// SCENARIO 1: EXTREME CONCURRENCY & RACE CONDITION (2,000 CONCURRENT REQUESTS)
// -------------------------------------------------------------------------------------------------

func TestChaos_DoubleSpending_2000Goroutines(t *testing.T) {
	_, _, prod, wh, loc, invService, _, _, _, _ := setupChaosTestEnvironment()
	ctx := context.Background()

	// Initial Condition: exactly 10 units in stock
	initialStock := 10
	_, err := invService.StockIn(ctx, models.StockInRequest{
		ProductID:   prod.ID.Hex(),
		WarehouseID: wh.ID.Hex(),
		LocationID:  loc.ID.Hex(),
		Quantity:    initialStock,
	}, "user_seed", "Seed Admin")
	if err != nil {
		t.Fatalf("Failed to seed initial stock: %v", err)
	}

	// Attack: 2,000 goroutines firing simultaneously at the exact same instant
	totalWorkers := 2000
	var successCount int64
	var insufficientStockCount int64
	var otherErrorCount int64

	var wg sync.WaitGroup
	wg.Add(totalWorkers)

	readyBarrier := make(chan struct{})

	for i := 0; i < totalWorkers; i++ {
		go func(workerID int) {
			defer wg.Done()
			// Synchronize at the starting gate
			<-readyBarrier

			_, err := invService.StockOut(ctx, models.StockOutRequest{
				ProductID:   prod.ID.Hex(),
				WarehouseID: wh.ID.Hex(),
				LocationID:  loc.ID.Hex(),
				Quantity:    1,
				Notes:       fmt.Sprintf("chaos-worker-%d", workerID),
			}, fmt.Sprintf("user-%d", workerID), "Chaos Worker")

			if err == nil {
				atomic.AddInt64(&successCount, 1)
			} else if errors.Is(err, repository.ErrInsufficientStock) {
				atomic.AddInt64(&insufficientStockCount, 1)
			} else {
				atomic.AddInt64(&otherErrorCount, 1)
			}
		}(i)
	}

	// Release all 2,000 workers simultaneously
	startTime := time.Now()
	close(readyBarrier)
	wg.Wait()
	duration := time.Since(startTime)

	t.Logf("=== 2,000 CONCURRENT STOCK-OUT RESULTS ===")
	t.Logf("Elapsed Time: %v (~%.0f req/s)", duration, float64(totalWorkers)/duration.Seconds())
	t.Logf("Success Count (Stocked Out): %d", successCount)
	t.Logf("Rejected (Insufficient Stock): %d", insufficientStockCount)
	t.Logf("Other Errors: %d", otherErrorCount)

	// INVARIANT 1: Exactly 10 requests must succeed
	if successCount != int64(initialStock) {
		t.Errorf("CRITICAL RACE CONDITION! Expected exactly %d successes, but got %d", initialStock, successCount)
	}

	// INVARIANT 2: Exactly 1,990 requests must fail with InsufficientStock
	expectedRejections := int64(totalWorkers - initialStock)
	if insufficientStockCount != expectedRejections {
		t.Errorf("Expected exactly %d rejections, but got %d", expectedRejections, insufficientStockCount)
	}

	if otherErrorCount > 0 {
		t.Errorf("Encountered unexpected errors during stock out: %d", otherErrorCount)
	}

	// INVARIANT 3: Final stock MUST be exactly 0 (Zero Overdraft Guarantee)
	items, _, err := invService.GetInventory(ctx, models.InventoryQueryParam{
		WarehouseID: wh.ID.Hex(),
		ProductID:   prod.ID.Hex(),
	})
	if err != nil {
		t.Fatalf("Failed to query inventory: %v", err)
	}
	if len(items) == 0 {
		t.Fatalf("Inventory item disappeared!")
	}
	if items[0].QuantityOnHand != 0 {
		t.Errorf("CRITICAL OVERDRAFT! Final QuantityOnHand is %d, expected 0", items[0].QuantityOnHand)
	}
	if items[0].QuantityAvailable != 0 {
		t.Errorf("CRITICAL OVERDRAFT! Final QuantityAvailable is %d, expected 0", items[0].QuantityAvailable)
	}

	// INVARIANT 4: Audit ledger count must be exactly 1 initial + 10 out = 11 movements
	movements, _, err := invService.GetMovements(ctx, models.MovementQueryParam{
		WarehouseID: wh.ID.Hex(),
		ProductID:   prod.ID.Hex(),
	})
	if err != nil {
		t.Fatalf("Failed to query movements: %v", err)
	}
	if len(movements) != initialStock+1 {
		t.Errorf("Ledger audit mismatch! Expected %d movements, got %d", initialStock+1, len(movements))
	}
}

func TestChaos_BurstReadSurge_2000Requests(t *testing.T) {
	router, _, _, _, _, _, _, _, _, staffToken := setupChaosTestEnvironment()

	totalRequests := 2000
	var successCount int64
	var errorCount int64

	endpoints := []string{
		"/api/v1/inventory/analytics/capacity",
		"/api/v1/products",
		"/api/v1/inventory",
	}

	var wg sync.WaitGroup
	wg.Add(totalRequests)

	startBarrier := make(chan struct{})
	latencies := make([]time.Duration, totalRequests)

	for i := 0; i < totalRequests; i++ {
		go func(idx int) {
			defer wg.Done()
			endpoint := endpoints[idx%len(endpoints)]
			req, _ := http.NewRequest(http.MethodGet, endpoint, nil)
			req.Header.Set("Authorization", "Bearer "+staffToken)
			w := httptest.NewRecorder()

			<-startBarrier
			t0 := time.Now()
			router.ServeHTTP(w, req)
			latencies[idx] = time.Since(t0)

			if w.Code == http.StatusOK {
				atomic.AddInt64(&successCount, 1)
			} else {
				atomic.AddInt64(&errorCount, 1)
			}
		}(i)
	}

	t0 := time.Now()
	close(startBarrier)
	wg.Wait()
	totalDuration := time.Since(t0)

	t.Logf("=== 2,000 CONCURRENT READ SURGE RESULTS ===")
	t.Logf("Total Time: %v (~%.0f req/s)", totalDuration, float64(totalRequests)/totalDuration.Seconds())
	t.Logf("HTTP 200 OK: %d / %d", successCount, totalRequests)
	t.Logf("HTTP Errors: %d", errorCount)

	if successCount != int64(totalRequests) {
		t.Errorf("Expected 100%% success on read surge, got %d errors", errorCount)
	}
}

func TestChaos_ConcurrentRackAllocationClash_100Reqs(t *testing.T) {
	_, _, _, _, _, _, whService, _, _, _ := setupChaosTestEnvironment()
	ctx := context.Background()

	// Create warehouse with 1,000 capacity
	testWh, err := whService.CreateWarehouse(ctx, models.CreateWarehouseRequest{
		Code:     "RACK-CLASH-WH",
		Name:     "Rack Clash Warehouse",
		Capacity: 1000,
	})
	if err != nil {
		t.Fatalf("Failed to create warehouse: %v", err)
	}

	// Attack: 100 concurrent requests each attempting to create a rack of 500 capacity.
	// Since warehouse capacity is 1,000, AT MOST 2 racks can succeed (2 * 500 = 1000).
	totalAttempts := 100
	var successCount int64
	var rejectedCount int64

	var wg sync.WaitGroup
	wg.Add(totalAttempts)
	barrier := make(chan struct{})

	for i := 0; i < totalAttempts; i++ {
		go func(rackNum int) {
			defer wg.Done()
			<-barrier

			_, err := whService.CreateLocation(ctx, testWh.ID, models.CreateLocationRequest{
				Zone:        "Zone A",
				Rack:        fmt.Sprintf("%02d", rackNum),
				Shelf:       "01",
				Bin:         "A",
				Type:        models.LocationTypeShelf,
				MaxCapacity: 500,
			})
			if err == nil {
				atomic.AddInt64(&successCount, 1)
			} else {
				atomic.AddInt64(&rejectedCount, 1)
			}
		}(i)
	}

	close(barrier)
	wg.Wait()

	t.Logf("=== CONCURRENT RACK ALLOCATION CLASH ===")
	t.Logf("Success: %d, Rejected: %d", successCount, rejectedCount)

	if successCount > 2 {
		t.Errorf("OVER-ALLOCATION BREACH! Warehouse capacity 1,000 allowed %d racks of 500 (total %d)", successCount, successCount*500)
	}

	locs, err := whService.ListLocations(ctx, testWh.ID)
	if err != nil {
		t.Fatalf("Failed to list locations: %v", err)
	}
	var totalAllocated int
	for _, l := range locs {
		totalAllocated += l.MaxCapacity
	}
	if totalAllocated > testWh.Capacity {
		t.Errorf("Warehouse over-allocated! Total bin capacity %d exceeds warehouse capacity %d", totalAllocated, testWh.Capacity)
	}
}

// -------------------------------------------------------------------------------------------------
// SCENARIO 2: ACCOUNT SECURITY & AUTHENTICATION PENETRATION
// -------------------------------------------------------------------------------------------------

func TestChaos_Security_BruteForceLoginSurge_500Reqs(t *testing.T) {
	router, _, _, _, _, _, _, _, _, _ := setupChaosTestEnvironment()

	totalAttacks := 500
	var rejectedCount int64
	var crashCount int64

	var wg sync.WaitGroup
	wg.Add(totalAttacks)
	barrier := make(chan struct{})

	for i := 0; i < totalAttacks; i++ {
		go func(attempt int) {
			defer wg.Done()
			payload, _ := json.Marshal(models.LoginRequest{
				Email:    "admin@chaos.test",
				Password: fmt.Sprintf("WrongPass-%d-XYZ!", attempt),
			})

			req, _ := http.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBuffer(payload))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			<-barrier
			router.ServeHTTP(w, req)

			if w.Code == http.StatusUnauthorized {
				atomic.AddInt64(&rejectedCount, 1)
			} else {
				atomic.AddInt64(&crashCount, 1)
			}
		}(i)
	}

	t0 := time.Now()
	close(barrier)
	wg.Wait()
	duration := time.Since(t0)

	t.Logf("=== 500 BRUTE FORCE LOGIN SURGE ===")
	t.Logf("Duration: %v (~%.0f req/s)", duration, float64(totalAttacks)/duration.Seconds())
	t.Logf("Correctly Rejected (401 Unauthorized): %d / %d", rejectedCount, totalAttacks)

	if rejectedCount != int64(totalAttacks) {
		t.Errorf("Brute force defense leak! Expected %d rejections, got %d (unexpected: %d)", totalAttacks, rejectedCount, crashCount)
	}
}

func TestChaos_Security_JWTForgeryAndTampering(t *testing.T) {
	router, cfg, _, _, _, _, _, _, _, _ := setupChaosTestEnvironment()

	testCases := []struct {
		name       string
		token      string
		expectCode int
	}{
		{
			name:       "Garbage Token String",
			token:      "invalid.token.payload.here",
			expectCode: http.StatusUnauthorized,
		},
		{
			name:       "Empty Bearer Token",
			token:      "",
			expectCode: http.StatusUnauthorized,
		},
		{
			name: "Forged Secret Signature Attack",
			token: func() string {
				claims := &utils.JWTClaims{
					UserID: primitive.NewObjectID().Hex(),
					Email:  "attacker@chaos.test",
					Role:   models.RoleSuperAdmin,
					RegisteredClaims: jwt.RegisteredClaims{
						ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
					},
				}
				token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
				signed, _ := token.SignedString([]byte("wrong-attacker-secret-key"))
				return signed
			}(),
			expectCode: http.StatusUnauthorized,
		},
		{
			name: "Expired JWT Attack",
			token: func() string {
				claims := &utils.JWTClaims{
					UserID: primitive.NewObjectID().Hex(),
					Email:  "expired@chaos.test",
					Role:   models.RoleSuperAdmin,
					RegisteredClaims: jwt.RegisteredClaims{
						ExpiresAt: jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
					},
				}
				token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
				signed, _ := token.SignedString([]byte(cfg.JWTSecret))
				return signed
			}(),
			expectCode: http.StatusUnauthorized,
		},
		{
			name: "None Algorithm Header Attack (alg=none)",
			token: func() string {
				// Base64 header {"alg":"none","typ":"JWT"} + payload {"role":"super_admin"} + no signature
				header := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"
				payload := "eyJlbWFpbCI6ImhhY2tlckBjaGFvcy50ZXN0Iiwicm9sZSI6InN1cGVyX2FkbWluIn0"
				return header + "." + payload + "."
			}(),
			expectCode: http.StatusUnauthorized,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodGet, "/api/v1/inventory", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tc.expectCode {
				t.Errorf("%s: Expected status %d, got %d (body: %s)", tc.name, tc.expectCode, w.Code, w.Body.String())
			}
		})
	}
}

func TestChaos_Security_PrivilegeEscalation_StaffForbidden(t *testing.T) {
	router, _, _, wh, _, _, _, _, _, staffToken := setupChaosTestEnvironment()

	attackEndpoints := []struct {
		method   string
		endpoint string
		body     string
	}{
		{
			method:   http.MethodPost,
			endpoint: "/api/v1/users",
			body:     `{"name":"Rogue User","email":"rogue@chaos.test","password":"Password123!","role":"super_admin"}`,
		},
		{
			method:   http.MethodDelete,
			endpoint: "/api/v1/warehouses/" + wh.ID.Hex(),
			body:     "",
		},
		{
			method:   http.MethodPost,
			endpoint: "/api/v1/inventory/adjust",
			body:     `{"product_id":"` + primitive.NewObjectID().Hex() + `","warehouse_id":"` + wh.ID.Hex() + `","actual_quantity":9999}`,
		},
		{
			method:   http.MethodDelete,
			endpoint: "/api/v1/purchase-orders/" + primitive.NewObjectID().Hex(),
			body:     "",
		},
		{
			method:   http.MethodDelete,
			endpoint: "/api/v1/sales-orders/" + primitive.NewObjectID().Hex(),
			body:     "",
		},
		{
			method:   http.MethodGet,
			endpoint: "/api/v1/admin/diagnostics",
			body:     "",
		},
	}

	for _, att := range attackEndpoints {
		t.Run(att.method+" "+att.endpoint, func(t *testing.T) {
			var bodyReader *bytes.Buffer
			if att.body != "" {
				bodyReader = bytes.NewBufferString(att.body)
			} else {
				bodyReader = bytes.NewBuffer(nil)
			}
			req, _ := http.NewRequest(att.method, att.endpoint, bodyReader)
			req.Header.Set("Authorization", "Bearer "+staffToken)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Errorf("PRIVILEGE ESCALATION VULNERABILITY! Staff called %s %s and got %d instead of 403 Forbidden! Response: %s",
					att.method, att.endpoint, w.Code, w.Body.String())
			}
		})
	}
}

func TestChaos_Security_MalformedPayloadsAndInjections(t *testing.T) {
	router, _, prod, wh, loc, _, _, _, adminToken, _ := setupChaosTestEnvironment()

	malformedTests := []struct {
		name       string
		endpoint   string
		payload    string
		expectCode int
	}{
		{
			name:       "Negative Stock In Quantity",
			endpoint:   "/api/v1/inventory/stock-in",
			payload:    fmt.Sprintf(`{"product_id":"%s","warehouse_id":"%s","location_id":"%s","quantity":-500}`, prod.ID.Hex(), wh.ID.Hex(), loc.ID.Hex()),
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "Zero Stock In Quantity",
			endpoint:   "/api/v1/inventory/stock-in",
			payload:    fmt.Sprintf(`{"product_id":"%s","warehouse_id":"%s","location_id":"%s","quantity":0}`, prod.ID.Hex(), wh.ID.Hex(), loc.ID.Hex()),
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "Oversized 100KB Malformed JSON String",
			endpoint:   "/api/v1/products",
			payload:    fmt.Sprintf(`{"name":"%s","sku":"TEST-OVERSIZED","unit":"pcs"}`, strings.Repeat("A", 100000)),
			expectCode: http.StatusOK, // accepted or handled gracefully, MUST NOT CRASH
		},
		{
			name:       "NoSQL Object Injection Payload",
			endpoint:   "/api/v1/auth/login",
			payload:    `{"email":{"$gt":""},"password":{"$gt":""}}`,
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "Null Byte Injection in ID",
			endpoint:   "/api/v1/warehouses/%00%00malicious",
			payload:    "",
			expectCode: http.StatusBadRequest,
		},
	}

	for _, tc := range malformedTests {
		t.Run(tc.name, func(t *testing.T) {
			var bodyReader *bytes.Buffer
			method := http.MethodPost
			if tc.payload != "" {
				bodyReader = bytes.NewBufferString(tc.payload)
			} else {
				method = http.MethodDelete
				bodyReader = bytes.NewBuffer(nil)
			}
			req, _ := http.NewRequest(method, tc.endpoint, bodyReader)
			req.Header.Set("Authorization", "Bearer "+adminToken)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			// Must not panic or crash
			router.ServeHTTP(w, req)

			if w.Code >= 500 {
				t.Errorf("%s: Server returned 5xx crash code %d! Body: %s", tc.name, w.Code, w.Body.String())
			}
		})
	}
}

// -------------------------------------------------------------------------------------------------
// SCENARIO 3: SERVICE DEGRADATION & FAULT RESILIENCE
// -------------------------------------------------------------------------------------------------

func TestChaos_Resilience_MidFlightClientCancellation_500Reqs(t *testing.T) {
	router, _, _, _, _, _, _, _, _, staffToken := setupChaosTestEnvironment()

	totalCancellations := 500
	var wg sync.WaitGroup
	wg.Add(totalCancellations)

	for i := 0; i < totalCancellations; i++ {
		go func() {
			defer wg.Done()
			ctx, cancel := context.WithCancel(context.Background())
			// Cancel immediately or mid-flight
			cancel()

			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "/api/v1/inventory/analytics/capacity", nil)
			req.Header.Set("Authorization", "Bearer "+staffToken)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)
		}()
	}

	wg.Wait()

	// INVARIANT: After 500 abruptly canceled requests, the server MUST be completely healthy
	// and process new requests with 200 OK without deadlocking on orphaned mutexes.
	healthyReq, _ := http.NewRequest(http.MethodGet, "/api/v1/inventory/analytics/capacity", nil)
	healthyReq.Header.Set("Authorization", "Bearer "+staffToken)
	healthyRec := httptest.NewRecorder()

	router.ServeHTTP(healthyRec, healthyReq)

	if healthyRec.Code != http.StatusOK {
		t.Fatalf("Server Deadlock / Hang after mid-flight cancellation! Got code %d, body: %s", healthyRec.Code, healthyRec.Body.String())
	}
	t.Log("Server successfully handled 500 client cancellations and recovered cleanly.")
}

// Fault-injecting repository wrapper to simulate sudden database death and recovery
type faultInjectingRepo struct {
	repository.InventoryRepository
	isKilled int32
}

func (f *faultInjectingRepo) StockIn(ctx context.Context, item *models.InventoryItem, qty int) (*models.InventoryItem, int, error) {
	if atomic.LoadInt32(&f.isKilled) == 1 {
		return nil, 0, errors.New("FATAL: MongoDB connection timed out / server down")
	}
	return f.InventoryRepository.StockIn(ctx, item, qty)
}

func (f *faultInjectingRepo) FindItems(ctx context.Context, params models.InventoryQueryParam) ([]models.InventoryItem, int64, error) {
	if atomic.LoadInt32(&f.isKilled) == 1 {
		return nil, 0, errors.New("FATAL: MongoDB connection timed out / server down")
	}
	return f.InventoryRepository.FindItems(ctx, params)
}

func TestChaos_Resilience_DatabaseOutageAndSelfHealing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(gin.Recovery())

	baseRepo := repository.NewMemoryInventoryRepository()
	faultRepo := &faultInjectingRepo{InventoryRepository: baseRepo}
	prodRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()

	ctx := context.Background()
	prodID := primitive.NewObjectID()
	_ = prodRepo.CreateProduct(ctx, &models.Product{
		ID:       prodID,
		SKU:      "FAULT-PROD",
		Name:     "Fault Tolerance Test Item",
		Unit:     "pcs",
		MinStock: 5,
	})
	whID := primitive.NewObjectID()
	_ = whRepo.CreateWarehouse(ctx, &models.Warehouse{
		ID:       whID,
		Code:     "FAULT-WH",
		Name:     "Fault WH",
		Capacity: 1000,
		IsActive: true,
	})
	locID := primitive.NewObjectID()
	_ = whRepo.CreateLocation(ctx, &models.Location{
		ID:          locID,
		WarehouseID: whID,
		Code:        "FAULT-LOC",
		MaxCapacity: 500,
		IsActive:    true,
	})

	invService := service.NewInventoryService(faultRepo, prodRepo, whRepo)
	invHandler := handler.NewInventoryHandler(invService)

	cfg := &config.Config{JWTSecret: "fault-test-secret", JWTExpiryHours: 24}
	token, _, _ := utils.GenerateJWT(&models.User{
		ID:       primitive.NewObjectID(),
		Role:     models.RoleSuperAdmin,
		IsActive: true,
	}, cfg.JWTSecret, cfg.JWTExpiryHours)

	v1 := router.Group("/api/v1")
	v1.Use(middleware.AuthMiddleware(cfg))
	{
		v1.GET("/inventory", invHandler.ListInventory)
		v1.POST("/inventory/stock-in", invHandler.StockIn)
	}

	// 1. Normal state: StockIn succeeds
	stockInPayload := fmt.Sprintf(`{"product_id":"%s","warehouse_id":"%s","location_id":"%s","quantity":50}`,
		prodID.Hex(), whID.Hex(), locID.Hex())

	req1, _ := http.NewRequest(http.MethodPost, "/api/v1/inventory/stock-in", bytes.NewBufferString(stockInPayload))
	req1.Header.Set("Authorization", "Bearer "+token)
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated && w1.Code != http.StatusOK {
		t.Fatalf("Pre-outage request failed with code %d: %s", w1.Code, w1.Body.String())
	}

	// 2. FAULT INJECTION: Simulate database outage (connection dropped / process killed)
	atomic.StoreInt32(&faultRepo.isKilled, 1)

	reqOutage, _ := http.NewRequest(http.MethodPost, "/api/v1/inventory/stock-in", bytes.NewBufferString(stockInPayload))
	reqOutage.Header.Set("Authorization", "Bearer "+token)
	reqOutage.Header.Set("Content-Type", "application/json")
	wOutage := httptest.NewRecorder()

	// MUST NOT PANIC OR CRASH THE HTTP SERVER
	router.ServeHTTP(wOutage, reqOutage)

	if wOutage.Code < 400 {
		t.Errorf("Expected HTTP error (>= 400) during database outage, got %d", wOutage.Code)
	}
	var errResp map[string]interface{}
	_ = json.Unmarshal(wOutage.Body.Bytes(), &errResp)
	if errResp["success"] != false {
		t.Errorf("Expected structured error JSON response during DB downtime, got: %s", wOutage.Body.String())
	}
	t.Logf("Database Outage Test Passed: Server returned structured error JSON without crashing (code: %d)", wOutage.Code)

	// 3. FAULT RECOVERY (Self-Healing): Database connection restores
	atomic.StoreInt32(&faultRepo.isKilled, 0)

	reqRecover, _ := http.NewRequest(http.MethodGet, "/api/v1/inventory", nil)
	reqRecover.Header.Set("Authorization", "Bearer "+token)
	wRecover := httptest.NewRecorder()

	router.ServeHTTP(wRecover, reqRecover)

	if wRecover.Code != http.StatusOK {
		t.Fatalf("Post-recovery request failed! Server did not recover. Code: %d, body: %s", wRecover.Code, wRecover.Body.String())
	}
	t.Log("Self-Healing Test Passed: Server immediately resumed processing requests normally after DB reconnection.")
}
