package service_test

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
)

func setupSOService(t *testing.T) (service.SOService, service.InventoryService, primitive.ObjectID, primitive.ObjectID, primitive.ObjectID, primitive.ObjectID) {
	soRepo := repository.NewMemorySORepository()
	productRepo := repository.NewProductMemoryRepository()
	whRepo := repository.NewWarehouseMemoryRepository()
	invRepo := repository.NewMemoryInventoryRepository()

	ctx := context.Background()

	// Seed product
	prodID := primitive.NewObjectID()
	prod := &models.Product{
		ID:        prodID,
		SKU:       "PROD-LAPTOP-01",
		Name:      "Enterprise Laptop Pro 15",
		Unit:      "units",
		CostPrice: 12000000,
		Price:     15000000,
		MinStock:  5,
	}
	if err := productRepo.CreateProduct(ctx, prod); err != nil {
		t.Fatalf("failed to create product: %v", err)
	}

	// Seed warehouse
	whID := primitive.NewObjectID()
	wh := &models.Warehouse{
		ID:       whID,
		Code:     "JKT-HUB-01",
		Name:     "Jakarta Hub",
		City:     "Jakarta",
		Capacity: 10000,
		IsActive: true,
	}
	if err := whRepo.CreateWarehouse(ctx, wh); err != nil {
		t.Fatalf("failed to create warehouse: %v", err)
	}

	// Seed location
	locID := primitive.NewObjectID()
	loc := &models.Location{
		ID:          locID,
		WarehouseID: whID,
		Code:        "B-02-01-A",
		Zone:        "Zone B",
		Rack:        "02",
		Shelf:       "01",
		Bin:         "A",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 500,
		IsActive:    true,
	}
	if err := whRepo.CreateLocation(ctx, loc); err != nil {
		t.Fatalf("failed to create location: %v", err)
	}

	// Seed customer
	custID := primitive.NewObjectID()
	cust := &models.Customer{
		ID:       custID,
		Code:     "CUST-TEST-01",
		Name:     "PT Pelanggan Prioritas",
		Email:    "buyer@pelanggan.com",
		Phone:    "021-998877",
		Address:  "Sudirman Tower Lt. 15",
		City:     "Jakarta Pusat",
		IsActive: true,
	}
	if err := soRepo.CreateCustomer(ctx, cust); err != nil {
		t.Fatalf("failed to create customer: %v", err)
	}

	invService := service.NewInventoryService(invRepo, productRepo, whRepo)
	soService := service.NewSOService(soRepo, productRepo, whRepo, invService)

	return soService, invService, custID, whID, locID, prodID
}

func TestCreateSOAndCalculations(t *testing.T) {
	soService, _, custID, whID, locID, prodID := setupSOService(t)
	ctx := context.Background()

	req := models.CreateSORequest{
		CustomerID:      custID.Hex(),
		WarehouseID:     whID.Hex(),
		ShippingAddress: "Sudirman Tower Lt. 15, Jakarta Pusat",
		Notes:           "Deliver before 5 PM",
		Items: []models.CreateSOItemRequest{
			{
				ProductID:       prodID.Hex(),
				LocationID:      locID.Hex(),
				QuantityOrdered: 3,
				UnitPrice:       15000000,
			},
		},
	}

	so, err := soService.CreateSO(ctx, req, "user-admin", "Admin User")
	if err != nil {
		t.Fatalf("unexpected error creating SO: %v", err)
	}

	if so.OrderNumber[:3] != "SO-" {
		t.Errorf("expected order number prefix SO-, got %s", so.OrderNumber)
	}
	if so.Status != models.SOStatusDraft {
		t.Errorf("expected status draft, got %s", so.Status)
	}
	if so.TotalQuantity != 3 {
		t.Errorf("expected total quantity 3, got %d", so.TotalQuantity)
	}
	if so.TotalAmount != 45000000 {
		t.Errorf("expected total amount 45000000, got %f", so.TotalAmount)
	}
}

func TestSOConfirmAndReserveStock(t *testing.T) {
	soService, invService, custID, whID, locID, prodID := setupSOService(t)
	ctx := context.Background()

	// 1. Initial Stock In: 50 units
	_, err := invService.StockIn(ctx, models.StockInRequest{
		WarehouseID:   whID.Hex(),
		LocationID:    locID.Hex(),
		ProductID:     prodID.Hex(),
		Quantity:      50,
		ReferenceType: "initial",
		ReferenceID:   "INIT-01",
	}, "user-admin", "Admin")
	if err != nil {
		t.Fatalf("failed initial stock in: %v", err)
	}

	// 2. Create Draft SO for 20 units
	req := models.CreateSORequest{
		CustomerID:      custID.Hex(),
		WarehouseID:     whID.Hex(),
		ShippingAddress: "Jakarta",
		Items: []models.CreateSOItemRequest{
			{
				ProductID:       prodID.Hex(),
				LocationID:      locID.Hex(),
				QuantityOrdered: 20,
				UnitPrice:       15000000,
			},
		},
	}
	so, err := soService.CreateSO(ctx, req, "user-admin", "Admin")
	if err != nil {
		t.Fatalf("failed to create SO: %v", err)
	}

	// 3. Confirm SO -> Should atomically reserve 20 units
	confirmedSO, err := soService.ConfirmSO(ctx, so.ID)
	if err != nil {
		t.Fatalf("unexpected error confirming SO: %v", err)
	}
	if confirmedSO.Status != models.SOStatusConfirmed {
		t.Errorf("expected status confirmed, got %s", confirmedSO.Status)
	}

	// 4. Verify inventory balances
	items, _, err := invService.GetInventory(ctx, models.InventoryQueryParam{
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
	})
	if err != nil || len(items) == 0 {
		t.Fatalf("failed to fetch inventory items: %v", err)
	}

	inv := items[0]
	if inv.QuantityOnHand != 50 {
		t.Errorf("expected on_hand 50, got %d", inv.QuantityOnHand)
	}
	if inv.QuantityReserved != 20 {
		t.Errorf("expected reserved 20, got %d", inv.QuantityReserved)
	}
	if inv.QuantityAvailable != 30 {
		t.Errorf("expected available 30, got %d", inv.QuantityAvailable)
	}
}

func TestSOInsufficientStockRollback(t *testing.T) {
	soService, invService, custID, whID, locID, prodID := setupSOService(t)
	ctx := context.Background()

	// 1. Initial Stock In: 10 units
	_, err := invService.StockIn(ctx, models.StockInRequest{
		WarehouseID:   whID.Hex(),
		LocationID:    locID.Hex(),
		ProductID:     prodID.Hex(),
		Quantity:      10,
		ReferenceType: "initial",
	}, "user-admin", "Admin")
	if err != nil {
		t.Fatalf("failed initial stock in: %v", err)
	}

	// 2. Create Draft SO for 25 units (exceeds 10)
	req := models.CreateSORequest{
		CustomerID:      custID.Hex(),
		WarehouseID:     whID.Hex(),
		ShippingAddress: "Jakarta",
		Items: []models.CreateSOItemRequest{
			{
				ProductID:       prodID.Hex(),
				LocationID:      locID.Hex(),
				QuantityOrdered: 25,
				UnitPrice:       15000000,
			},
		},
	}
	so, err := soService.CreateSO(ctx, req, "user-admin", "Admin")
	if err != nil {
		t.Fatalf("failed to create SO: %v", err)
	}

	// 3. Confirm SO -> Should fail due to insufficient stock
	_, err = soService.ConfirmSO(ctx, so.ID)
	if err == nil {
		t.Fatalf("expected confirm to fail with insufficient stock error, but got nil")
	}

	// 4. Verify balances remain untouched
	items, _, _ := invService.GetInventory(ctx, models.InventoryQueryParam{
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
	})
	inv := items[0]
	if inv.QuantityReserved != 0 {
		t.Errorf("expected reserved 0 after rollback, got %d", inv.QuantityReserved)
	}
	if inv.QuantityAvailable != 10 {
		t.Errorf("expected available 10, got %d", inv.QuantityAvailable)
	}
}

func TestSOFulfillmentPipelineAndDispatch(t *testing.T) {
	soService, invService, custID, whID, locID, prodID := setupSOService(t)
	ctx := context.Background()

	// 1. Initial Stock In: 50 units
	_, err := invService.StockIn(ctx, models.StockInRequest{
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		ProductID:   prodID.Hex(),
		Quantity:    50,
	}, "user-admin", "Admin")
	if err != nil {
		t.Fatalf("stock in error: %v", err)
	}

	// 2. Create and Confirm SO for 15 units
	so, err := soService.CreateSO(ctx, models.CreateSORequest{
		CustomerID:      custID.Hex(),
		WarehouseID:     whID.Hex(),
		ShippingAddress: "Jakarta",
		Items: []models.CreateSOItemRequest{
			{
				ProductID:       prodID.Hex(),
				LocationID:      locID.Hex(),
				QuantityOrdered: 15,
				UnitPrice:       15000000,
			},
		},
	}, "user-admin", "Admin")
	if err != nil {
		t.Fatalf("create SO error: %v", err)
	}

	so, err = soService.ConfirmSO(ctx, so.ID)
	if err != nil {
		t.Fatalf("confirm SO error: %v", err)
	}

	// 3. Start Picking
	so, err = soService.StartPicking(ctx, so.ID)
	if err != nil {
		t.Fatalf("start picking error: %v", err)
	}
	if so.Status != models.SOStatusPicking {
		t.Errorf("expected status picking, got %s", so.Status)
	}

	// 4. Start Packing
	so, err = soService.StartPacking(ctx, so.ID)
	if err != nil {
		t.Fatalf("start packing error: %v", err)
	}
	if so.Status != models.SOStatusPacking {
		t.Errorf("expected status packing, got %s", so.Status)
	}

	// 5. Dispatch / Ship SO with courier
	dispatchReq := models.DispatchSORequest{
		Carrier:        "SiCepat Cargo",
		TrackingNumber: "SC-11223344",
		Notes:          "Handle with care",
	}
	so, err = soService.DispatchSO(ctx, so.ID, dispatchReq, "user-staff", "Staff Warehouse")
	if err != nil {
		t.Fatalf("dispatch error: %v", err)
	}
	if so.Status != models.SOStatusShipped {
		t.Errorf("expected status shipped, got %s", so.Status)
	}
	if so.Carrier != "SiCepat Cargo" || so.TrackingNumber != "SC-11223344" {
		t.Errorf("tracking info not set properly: %s / %s", so.Carrier, so.TrackingNumber)
	}

	// 6. Verify physical on_hand decreased by 15, reserved decreased by 15, available remains 35
	items, _, _ := invService.GetInventory(ctx, models.InventoryQueryParam{
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
	})
	inv := items[0]
	if inv.QuantityOnHand != 35 {
		t.Errorf("expected physical on_hand 35, got %d", inv.QuantityOnHand)
	}
	if inv.QuantityReserved != 0 {
		t.Errorf("expected reserved 0 after dispatch, got %d", inv.QuantityReserved)
	}
	if inv.QuantityAvailable != 35 {
		t.Errorf("expected available 35, got %d", inv.QuantityAvailable)
	}

	// 7. Deliver SO
	so, err = soService.DeliverSO(ctx, so.ID)
	if err != nil {
		t.Fatalf("deliver error: %v", err)
	}
	if so.Status != models.SOStatusDelivered {
		t.Errorf("expected status delivered, got %s", so.Status)
	}
}

func TestSOCancelAndReleaseStock(t *testing.T) {
	soService, invService, custID, whID, locID, prodID := setupSOService(t)
	ctx := context.Background()

	// 1. Initial Stock In: 50 units
	_, _ = invService.StockIn(ctx, models.StockInRequest{
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
		ProductID:   prodID.Hex(),
		Quantity:    50,
	}, "user-admin", "Admin")

	// 2. Create and Confirm SO for 20 units
	so, _ := soService.CreateSO(ctx, models.CreateSORequest{
		CustomerID:      custID.Hex(),
		WarehouseID:     whID.Hex(),
		ShippingAddress: "Jakarta",
		Items: []models.CreateSOItemRequest{
			{
				ProductID:       prodID.Hex(),
				LocationID:      locID.Hex(),
				QuantityOrdered: 20,
				UnitPrice:       15000000,
			},
		},
	}, "user-admin", "Admin")
	_, _ = soService.ConfirmSO(ctx, so.ID)

	// 3. Cancel order
	cancelledSO, err := soService.CancelSO(ctx, so.ID, "user-admin", "Admin")
	if err != nil {
		t.Fatalf("cancel error: %v", err)
	}
	if cancelledSO.Status != models.SOStatusCancelled {
		t.Errorf("expected status cancelled, got %s", cancelledSO.Status)
	}

	// 4. Verify reserved stock is released back to available
	items, _, _ := invService.GetInventory(ctx, models.InventoryQueryParam{
		WarehouseID: whID.Hex(),
		LocationID:  locID.Hex(),
	})
	inv := items[0]
	if inv.QuantityReserved != 0 {
		t.Errorf("expected reserved 0 after cancel, got %d", inv.QuantityReserved)
	}
	if inv.QuantityAvailable != 50 {
		t.Errorf("expected available 50 after cancel, got %d", inv.QuantityAvailable)
	}
}
