package service_test

import (
	"context"
	"sync"
	"testing"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func setupInventoryService(t *testing.T) (service.InventoryService, primitive.ObjectID, primitive.ObjectID, primitive.ObjectID) {
	invRepo := repository.NewMemoryInventoryRepository()
	productRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()

	ctx := context.Background()

	// Seed product
	prodID := primitive.NewObjectID()
	product := &models.Product{
		ID:       prodID,
		SKU:      "TEST-SKU-001",
		Name:     "Test Mechanical Keyboard",
		Unit:     "pcs",
		MinStock: 5,
	}
	if err := productRepo.CreateProduct(ctx, product); err != nil {
		t.Fatalf("failed to create test product: %v", err)
	}

	// Seed warehouse
	whID := primitive.NewObjectID()
	wh := &models.Warehouse{
		ID:       whID,
		Code:     "JKT-01",
		Name:     "Jakarta Main Hub",
		City:     "Jakarta",
		Capacity: 5000,
		IsActive: true,
	}
	if err := whRepo.CreateWarehouse(ctx, wh); err != nil {
		t.Fatalf("failed to create test warehouse: %v", err)
	}

	// Seed location
	locID := primitive.NewObjectID()
	loc := &models.Location{
		ID:          locID,
		WarehouseID: whID,
		Code:        "A-01-01-A",
		Zone:        "Zone A",
		Rack:        "01",
		Shelf:       "01",
		Bin:         "A",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 200,
		IsActive:    true,
	}
	if err := whRepo.CreateLocation(ctx, loc); err != nil {
		t.Fatalf("failed to create test location: %v", err)
	}

	invService := service.NewInventoryService(invRepo, productRepo, whRepo)
	return invService, prodID, whID, locID
}

func TestStockInAndLedger(t *testing.T) {
	s, prodID, whID, locID := setupInventoryService(t)
	ctx := context.Background()

	// 1. Initial Stock In
	req1 := models.StockInRequest{
		ProductID:     prodID.Hex(),
		WarehouseID:   whID.Hex(),
		LocationID:    locID.Hex(),
		Quantity:      50,
		ReferenceType: "po",
		ReferenceID:   "PO-100",
		Notes:         "Batch 1 inbound",
	}

	item1, err := s.StockIn(ctx, req1, "user123", "Rangga")
	if err != nil {
		t.Fatalf("expected stock in to succeed, got %v", err)
	}
	if item1.QuantityOnHand != 50 || item1.QuantityAvailable != 50 {
		t.Fatalf("expected quantity 50, got onHand: %d, available: %d", item1.QuantityOnHand, item1.QuantityAvailable)
	}

	// 2. Second Stock In (Incremental)
	req2 := models.StockInRequest{
		ProductID:     prodID.Hex(),
		WarehouseID:   whID.Hex(),
		LocationID:    locID.Hex(),
		Quantity:      30,
		ReferenceType: "po",
		ReferenceID:   "PO-101",
		Notes:         "Batch 2 inbound",
	}

	item2, err := s.StockIn(ctx, req2, "user123", "Rangga")
	if err != nil {
		t.Fatalf("expected incremental stock in to succeed, got %v", err)
	}
	if item2.QuantityOnHand != 80 || item2.QuantityAvailable != 80 {
		t.Fatalf("expected total quantity 80, got onHand: %d, available: %d", item2.QuantityOnHand, item2.QuantityAvailable)
	}

	// 3. Verify Ledger movements
	movements, total, err := s.GetMovements(ctx, models.MovementQueryParam{})
	if err != nil {
		t.Fatalf("failed to get movements: %v", err)
	}
	if total != 2 {
		t.Fatalf("expected 2 movements in ledger, got %d", total)
	}
	// Newest first
	if movements[0].BalanceBefore != 50 || movements[0].BalanceAfter != 80 {
		t.Fatalf("expected movement balances 50 -> 80, got %d -> %d", movements[0].BalanceBefore, movements[0].BalanceAfter)
	}
}

func TestStockOutAndInsufficientStockProtection(t *testing.T) {
	s, prodID, whID, locID := setupInventoryService(t)
	ctx := context.Background()

	// Initial stock of 20
	_, err := s.StockIn(ctx, models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    20,
	}, "user1", "Staff 1")
	if err != nil {
		t.Fatalf("stock in failed: %v", err)
	}

	// Successful Stock Out of 8
	outReq := models.StockOutRequest{
		ProductID:     prodID.Hex(),
		WarehouseID:   whID.Hex(),
		LocationID:    locID.Hex(),
		Quantity:      8,
		ReferenceType: "so",
		ReferenceID:   "SO-200",
		Notes:         "Order outbound",
	}
	item, err := s.StockOut(ctx, outReq, "user1", "Staff 1")
	if err != nil {
		t.Fatalf("stock out failed: %v", err)
	}
	if item.QuantityOnHand != 12 || item.QuantityAvailable != 12 {
		t.Fatalf("expected 12 remaining, got onHand: %d, available: %d", item.QuantityOnHand, item.QuantityAvailable)
	}

	// Overdraft attempt: try to take 15 when only 12 available
	overdraftReq := models.StockOutRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    15,
	}
	_, err = s.StockOut(ctx, overdraftReq, "user1", "Staff 1")
	if err == nil {
		t.Fatal("expected error on overdraft stock-out, but got nil")
	}

	// Verify stock is still 12 (no partial reduction)
	items, _, err := s.GetInventory(ctx, models.InventoryQueryParam{ProductID: prodID.Hex()})
	if err != nil || len(items) == 0 {
		t.Fatalf("failed to query inventory: %v", err)
	}
	if items[0].QuantityOnHand != 12 {
		t.Fatalf("expected stock to remain 12 after rejected overdraft, got %d", items[0].QuantityOnHand)
	}
}

func TestStockAdjustment(t *testing.T) {
	s, prodID, whID, locID := setupInventoryService(t)
	ctx := context.Background()

	// Initial stock of 100
	_, _ = s.StockIn(ctx, models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    100,
	}, "admin", "Admin")

	// Physical count reveals only 95 (shrinkage)
	adjReq := models.StockAdjustmentRequest{
		ProductID:      prodID.Hex(),
		WarehouseID:    whID.Hex(),
		LocationID:     locID.Hex(),
		ActualQuantity: 95,
		Reason:         "Annual Stock Opname",
		Notes:          "Shrinkage / damaged packaging write-off",
	}

	adjItem, err := s.AdjustStock(ctx, adjReq, "manager", "Warehouse Manager")
	if err != nil {
		t.Fatalf("stock adjust failed: %v", err)
	}
	if adjItem.QuantityOnHand != 95 || adjItem.QuantityAvailable != 95 {
		t.Fatalf("expected adjusted balance 95, got %d", adjItem.QuantityOnHand)
	}

	// Verify ledger delta is -5
	movs, _, err := s.GetMovements(ctx, models.MovementQueryParam{MovementType: "adjustment"})
	if err != nil || len(movs) == 0 {
		t.Fatalf("expected adjustment movement recorded, got: %v", err)
	}
	if movs[0].Quantity != -5 || movs[0].BalanceBefore != 100 || movs[0].BalanceAfter != 95 {
		t.Fatalf("unexpected movement record: delta=%d, before=%d, after=%d", movs[0].Quantity, movs[0].BalanceBefore, movs[0].BalanceAfter)
	}
}

func TestConcurrentStockOutSafety(t *testing.T) {
	s, prodID, whID, locID := setupInventoryService(t)
	ctx := context.Background()

	// Initial stock of 50 items
	_, err := s.StockIn(ctx, models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    50,
	}, "system", "System")
	if err != nil {
		t.Fatalf("stock in failed: %v", err)
	}

	// Run 20 concurrent goroutines, each trying to stock out 5 items (Total requested: 100, Total available: 50)
	// Exactly 10 should succeed (10 * 5 = 50), and exactly 10 should fail with ErrInsufficientStock.
	var wg sync.WaitGroup
	var successCount int
	var failureCount int
	var countMu sync.Mutex

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			_, err := s.StockOut(ctx, models.StockOutRequest{
				ProductID:   prodID.Hex(),
				WarehouseID: whID.Hex(),
				LocationID:  locID.Hex(),
				Quantity:    5,
			}, "worker", "Worker")

			countMu.Lock()
			if err == nil {
				successCount++
			} else {
				failureCount++
			}
			countMu.Unlock()
		}(i)
	}

	wg.Wait()

	if successCount != 10 {
		t.Fatalf("expected exactly 10 successful stock-outs, got %d", successCount)
	}
	if failureCount != 10 {
		t.Fatalf("expected exactly 10 failed stock-outs, got %d", failureCount)
	}

	// Final balance must be exactly 0, never negative
	items, _, err := s.GetInventory(ctx, models.InventoryQueryParam{ProductID: prodID.Hex()})
	if err != nil || len(items) == 0 {
		t.Fatalf("inventory lookup failed: %v", err)
	}
	if items[0].QuantityOnHand != 0 || items[0].QuantityAvailable != 0 {
		t.Fatalf("expected exactly 0 stock remaining, got %d", items[0].QuantityOnHand)
	}
}

func TestStockIn_ExceedsBinCapacity(t *testing.T) {
	s, prodID, whID, locID := setupInventoryService(t) // loc max_capacity is 200
	ctx := context.Background()

	// 1. Stock In within limit (150 <= 200) -> SUCCESS
	req1 := models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    150,
	}
	_, err := s.StockIn(ctx, req1, "user1", "Rangga")
	if err != nil {
		t.Fatalf("expected initial stock in of 150 to succeed, got %v", err)
	}

	// 2. Stock In exceeding limit (150 + 60 = 210 > 200) -> MUST FAIL
	req2 := models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    60,
	}
	_, err = s.StockIn(ctx, req2, "user1", "Rangga")
	if err == nil {
		t.Fatalf("expected stock in of 60 to fail due to exceeding bin capacity (200), but it succeeded")
	}

	// 3. Stock in exact remaining capacity (50) -> SUCCESS (150 + 50 = 200)
	req3 := models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    50,
	}
	item3, err := s.StockIn(ctx, req3, "user1", "Rangga")
	if err != nil {
		t.Fatalf("expected stock in of exact remaining 50 to succeed, got %v", err)
	}
	if item3.QuantityOnHand != 200 {
		t.Fatalf("expected quantity 200, got %d", item3.QuantityOnHand)
	}
}

func TestAdjustStock_ExceedsBinCapacity(t *testing.T) {
	s, prodID, whID, locID := setupInventoryService(t) // loc max_capacity is 200
	ctx := context.Background()

	// Initial stock in 100
	_, err := s.StockIn(ctx, models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		Quantity:    100,
	}, "user1", "Rangga")
	if err != nil {
		t.Fatalf("setup stock in failed: %v", err)
	}

	// Adjust to 250 (> 200) -> MUST FAIL
	_, err = s.AdjustStock(ctx, models.StockAdjustmentRequest{
		ProductID:      prodID.Hex(),
		WarehouseID:    whID.Hex(),
		LocationID:     locID.Hex(),
		ActualQuantity: 250,
		Reason:         "audit",
	}, "user1", "Rangga")
	if err == nil {
		t.Fatalf("expected adjust stock to 250 to fail due to bin capacity limit of 200, but it succeeded")
	}

	// Adjust to 180 (<= 200) -> SUCCESS
	item, err := s.AdjustStock(ctx, models.StockAdjustmentRequest{
		ProductID:      prodID.Hex(),
		WarehouseID:    whID.Hex(),
		LocationID:     locID.Hex(),
		ActualQuantity: 180,
		Reason:         "audit",
	}, "user1", "Rangga")
	if err != nil {
		t.Fatalf("expected adjust to 180 to succeed, got %v", err)
	}
	if item.QuantityOnHand != 180 {
		t.Fatalf("expected quantity 180, got %d", item.QuantityOnHand)
	}
}

func TestGetWarehouseCapacityAnalytics(t *testing.T) {
	ctx := context.Background()
	invRepo := repository.NewMemoryInventoryRepository()
	productRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()

	prodID := primitive.NewObjectID()
	_ = productRepo.CreateProduct(ctx, &models.Product{
		ID:       prodID,
		SKU:      "SKU-CAP-1",
		Name:     "Test Product",
		Unit:     "pcs",
		MinStock: 5,
	})

	wh1ID := primitive.NewObjectID()
	_ = whRepo.CreateWarehouse(ctx, &models.Warehouse{
		ID:       wh1ID,
		Code:     "DPK-01",
		Name:     "Depok WH",
		Capacity: 10000,
		IsActive: true,
	})
	loc1ID := primitive.NewObjectID()
	_ = whRepo.CreateLocation(ctx, &models.Location{
		ID:          loc1ID,
		WarehouseID: wh1ID,
		Code:        "DPK-A1",
		MaxCapacity: 1000,
		IsActive:    true,
	})

	wh2ID := primitive.NewObjectID()
	_ = whRepo.CreateWarehouse(ctx, &models.Warehouse{
		ID:       wh2ID,
		Code:     "BGR-01",
		Name:     "Bogor WH",
		Capacity: 100000,
		IsActive: true,
	})

	s := service.NewInventoryService(invRepo, productRepo, whRepo)

	// Stock 100 items into Depok WH
	_, err := s.StockIn(ctx, models.StockInRequest{
		ProductID:   prodID.Hex(),
		WarehouseID: wh1ID.Hex(),
		LocationID:  loc1ID.Hex(),
		Quantity:    100,
	}, "user1", "Rangga")
	if err != nil {
		t.Fatalf("stock in failed: %v", err)
	}

	res, err := s.GetWarehouseCapacityAnalytics(ctx)
	if err != nil {
		t.Fatalf("GetWarehouseCapacityAnalytics failed: %v", err)
	}

	if res.TotalCapacity != 110000 {
		t.Errorf("expected total capacity 110000, got %d", res.TotalCapacity)
	}
	if res.TotalOnHand != 100 {
		t.Errorf("expected total on hand 100, got %d", res.TotalOnHand)
	}
	// 100 / 110000 * 100 = 0.0909 -> rounded to 0.1
	if res.UtilizationRate != 0.1 {
		t.Errorf("expected utilization rate 0.1, got %f", res.UtilizationRate)
	}

	for _, wh := range res.Warehouses {
		if wh.WarehouseID == wh1ID.Hex() {
			if wh.CurrentStock != 100 {
				t.Errorf("expected Depok stock 100, got %d", wh.CurrentStock)
			}
			// Depok occupancy: 100 / 10000 * 100 = 1.0%
			if wh.Percentage != 1.0 {
				t.Errorf("expected Depok occupancy 1.0%%, got %f", wh.Percentage)
			}
		} else if wh.WarehouseID == wh2ID.Hex() {
			if wh.CurrentStock != 0 {
				t.Errorf("expected Bogor stock 0, got %d", wh.CurrentStock)
			}
			if wh.Percentage != 0.0 {
				t.Errorf("expected Bogor occupancy 0.0%%, got %f", wh.Percentage)
			}
		}
	}
}
