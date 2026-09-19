package service_test

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
)

func setupPOService(t *testing.T) (service.POService, service.InventoryService, primitive.ObjectID, primitive.ObjectID, primitive.ObjectID, primitive.ObjectID) {
	poRepo := repository.NewMemoryPORepository()
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

	// Seed supplier
	supID := primitive.NewObjectID()
	sup := &models.Supplier{
		ID:       supID,
		Code:     "SUP-TEST-01",
		Name:     "PT Vendor Utama",
		Email:    "vendor@test.com",
		IsActive: true,
	}
	if err := poRepo.CreateSupplier(ctx, sup); err != nil {
		t.Fatalf("failed to create supplier: %v", err)
	}

	invService := service.NewInventoryService(invRepo, productRepo, whRepo)
	poService := service.NewPOService(poRepo, productRepo, whRepo, invService)

	return poService, invService, supID, whID, locID, prodID
}

func TestCreatePOAndCalculations(t *testing.T) {
	poSvc, _, supID, whID, _, prodID := setupPOService(t)
	ctx := context.Background()

	req := models.CreatePORequest{
		SupplierID:  supID.Hex(),
		WarehouseID: whID.Hex(),
		Notes:       "Q3 procurement test",
		Items: []models.CreatePOItemRequest{
			{
				ProductID:       prodID.Hex(),
				QuantityOrdered: 20,
				UnitCost:        10000000,
			},
		},
	}

	po, err := poSvc.CreatePO(ctx, req, "admin", "Admin User")
	if err != nil {
		t.Fatalf("failed to create PO: %v", err)
	}

	if po.Status != models.POStatusDraft {
		t.Fatalf("expected initial status 'draft', got '%s'", po.Status)
	}
	if po.TotalQuantityOrdered != 20 {
		t.Fatalf("expected total quantity 20, got %d", po.TotalQuantityOrdered)
	}
	if po.TotalAmount != 200000000 {
		t.Fatalf("expected total amount 200,000,000, got %.2f", po.TotalAmount)
	}
	if po.Items[0].Subtotal != 200000000 {
		t.Fatalf("expected line subtotal 200,000,000, got %.2f", po.Items[0].Subtotal)
	}
}

func TestPOStateMachineTransitions(t *testing.T) {
	poSvc, _, supID, whID, _, prodID := setupPOService(t)
	ctx := context.Background()

	po, err := poSvc.CreatePO(ctx, models.CreatePORequest{
		SupplierID:  supID.Hex(),
		WarehouseID: whID.Hex(),
		Items: []models.CreatePOItemRequest{
			{ProductID: prodID.Hex(), QuantityOrdered: 10, UnitCost: 1000},
		},
	}, "admin", "Admin User")
	if err != nil {
		t.Fatalf("create PO failed: %v", err)
	}

	// 1. Transition draft -> ordered
	orderedPO, err := poSvc.MarkOrdered(ctx, po.ID)
	if err != nil {
		t.Fatalf("mark ordered failed: %v", err)
	}
	if orderedPO.Status != models.POStatusOrdered {
		t.Fatalf("expected status 'ordered', got '%s'", orderedPO.Status)
	}

	// 2. Editing an ordered PO must be rejected
	_, err = poSvc.UpdatePO(ctx, po.ID, models.UpdatePORequest{
		SupplierID:  supID.Hex(),
		WarehouseID: whID.Hex(),
		Items: []models.CreatePOItemRequest{
			{ProductID: prodID.Hex(), QuantityOrdered: 15},
		},
	})
	if err == nil {
		t.Fatal("expected error when modifying locked ordered PO, got nil")
	}

	// 3. Cancel order
	cancelledPO, err := poSvc.CancelPO(ctx, po.ID)
	if err != nil {
		t.Fatalf("cancel PO failed: %v", err)
	}
	if cancelledPO.Status != models.POStatusCancelled {
		t.Fatalf("expected status 'cancelled', got '%s'", cancelledPO.Status)
	}
}

func TestReceivePOAndInventoryIntegration(t *testing.T) {
	poSvc, invSvc, supID, whID, locID, prodID := setupPOService(t)
	ctx := context.Background()

	// Create and place order for 50 laptops
	po, err := poSvc.CreatePO(ctx, models.CreatePORequest{
		SupplierID:  supID.Hex(),
		WarehouseID: whID.Hex(),
		Items: []models.CreatePOItemRequest{
			{ProductID: prodID.Hex(), QuantityOrdered: 50, UnitCost: 12000000},
		},
	}, "admin", "Admin User")
	if err != nil {
		t.Fatalf("create PO failed: %v", err)
	}

	_, err = poSvc.MarkOrdered(ctx, po.ID)
	if err != nil {
		t.Fatalf("mark ordered failed: %v", err)
	}

	// 1. Receive partial batch: 30 units
	recvReq1 := models.ReceivePORequest{
		Items: []models.ReceiveItemPayload{
			{
				ProductID:        prodID.Hex(),
				LocationID:       locID.Hex(),
				QuantityReceived: 30,
			},
		},
		Notes: "First delivery truck arrived",
	}

	partialPO, err := poSvc.ReceivePO(ctx, po.ID, recvReq1, "staff", "Warehouse Staff")
	if err != nil {
		t.Fatalf("partial receive failed: %v", err)
	}
	if partialPO.Status != models.POStatusPartiallyReceived {
		t.Fatalf("expected status 'partially_received', got '%s'", partialPO.Status)
	}
	if partialPO.TotalQuantityReceived != 30 {
		t.Fatalf("expected 30 received, got %d", partialPO.TotalQuantityReceived)
	}

	// Verify stock was automatically added to inventory!
	invItems, _, err := invSvc.GetInventory(ctx, models.InventoryQueryParam{ProductID: prodID.Hex()})
	if err != nil || len(invItems) == 0 {
		t.Fatalf("inventory lookup failed: %v", err)
	}
	if invItems[0].QuantityOnHand != 30 || invItems[0].QuantityAvailable != 30 {
		t.Fatalf("expected inventory on hand 30, got %d", invItems[0].QuantityOnHand)
	}

	// Verify ledger entry exists with reference to the PO number
	movements, _, err := invSvc.GetMovements(ctx, models.MovementQueryParam{ProductID: prodID.Hex()})
	if err != nil || len(movements) == 0 {
		t.Fatalf("movements lookup failed: %v", err)
	}
	if movements[0].ReferenceID != po.OrderNumber {
		t.Fatalf("expected movement reference ID '%s', got '%s'", po.OrderNumber, movements[0].ReferenceID)
	}

	// 2. Receive remaining 20 units
	recvReq2 := models.ReceivePORequest{
		Items: []models.ReceiveItemPayload{
			{
				ProductID:        prodID.Hex(),
				LocationID:       locID.Hex(),
				QuantityReceived: 20,
			},
		},
		Notes: "Final balance delivery",
	}

	completedPO, err := poSvc.ReceivePO(ctx, po.ID, recvReq2, "staff", "Warehouse Staff")
	if err != nil {
		t.Fatalf("final receive failed: %v", err)
	}
	if completedPO.Status != models.POStatusReceived {
		t.Fatalf("expected status 'received', got '%s'", completedPO.Status)
	}
	if completedPO.TotalQuantityReceived != 50 {
		t.Fatalf("expected 50 received, got %d", completedPO.TotalQuantityReceived)
	}

	// Verify inventory on hand is now exactly 50
	invItems2, _, _ := invSvc.GetInventory(ctx, models.InventoryQueryParam{ProductID: prodID.Hex()})
	if invItems2[0].QuantityOnHand != 50 {
		t.Fatalf("expected total inventory 50, got %d", invItems2[0].QuantityOnHand)
	}
}

func TestReceiveOverdraftProtection(t *testing.T) {
	poSvc, _, supID, whID, locID, prodID := setupPOService(t)
	ctx := context.Background()

	po, _ := poSvc.CreatePO(ctx, models.CreatePORequest{
		SupplierID:  supID.Hex(),
		WarehouseID: whID.Hex(),
		Items: []models.CreatePOItemRequest{
			{ProductID: prodID.Hex(), QuantityOrdered: 10, UnitCost: 100},
		},
	}, "admin", "Admin")

	_, _ = poSvc.MarkOrdered(ctx, po.ID)

	// Attempt to receive 15 units when only 10 were ordered
	overdraftReq := models.ReceivePORequest{
		Items: []models.ReceiveItemPayload{
			{ProductID: prodID.Hex(), LocationID: locID.Hex(), QuantityReceived: 15},
		},
	}
	_, err := poSvc.ReceivePO(ctx, po.ID, overdraftReq, "staff", "Staff")
	if err == nil {
		t.Fatal("expected error on receiving more than ordered, but got nil")
	}
}
