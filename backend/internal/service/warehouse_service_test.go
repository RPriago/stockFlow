package service

import (
	"context"
	"testing"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
)

func TestWarehouseServiceCRUD(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewWarehouseMemoryRepository()
	svc := NewWarehouseService(repo)

	// 1. Create Warehouse
	wh, err := svc.CreateWarehouse(ctx, models.CreateWarehouseRequest{
		Code:     "WH-TEST-01",
		Name:     "Test Hub Jakarta",
		Address:  "Jl. Testing No. 1",
		City:     "Jakarta",
		Capacity: 10000,
	})
	if err != nil {
		t.Fatalf("Failed to create warehouse: %v", err)
	}

	if wh.ID.IsZero() {
		t.Errorf("Expected warehouse ID to be set")
	}

	// 2. Duplicate Code rejection
	_, err = svc.CreateWarehouse(ctx, models.CreateWarehouseRequest{
		Code:     "WH-TEST-01",
		Name:     "Duplicate Hub",
		Address:  "Jl. Other",
		City:     "Jakarta",
		Capacity: 5000,
	})
	if err == nil {
		t.Errorf("Expected error when creating duplicate warehouse code, got nil")
	}

	// 3. Create Storage Location Bin
	bin, err := svc.CreateLocation(ctx, wh.ID, models.CreateLocationRequest{
		Zone:        "A",
		Rack:        "01",
		Shelf:       "02",
		Bin:         "B",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 500,
	})
	if err != nil {
		t.Fatalf("Failed to create location bin: %v", err)
	}

	expectedCode := "A-01-02-B"
	if bin.Code != expectedCode {
		t.Errorf("Expected bin code %s, got %s", expectedCode, bin.Code)
	}

	// 4. Duplicate bin in same warehouse rejection
	_, err = svc.CreateLocation(ctx, wh.ID, models.CreateLocationRequest{
		Zone:        "A",
		Rack:        "01",
		Shelf:       "02",
		Bin:         "B",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 500,
	})
	if err == nil {
		t.Errorf("Expected duplicate location code error, got nil")
	}

	// 5. List Locations
	locations, err := svc.ListLocations(ctx, wh.ID)
	if err != nil {
		t.Fatalf("Failed to list locations: %v", err)
	}
	if len(locations) != 1 {
		t.Errorf("Expected 1 location, got %d", len(locations))
	}

	// 6. Delete Warehouse cascades
	err = svc.DeleteWarehouse(ctx, wh.ID)
	if err != nil {
		t.Fatalf("Failed to delete warehouse: %v", err)
	}

	_, err = svc.GetWarehouseByID(ctx, wh.ID)
	if err == nil {
		t.Errorf("Expected ErrWarehouseNotFound, got nil")
	}
}

func TestWarehouseCapacityLimitOnBinCreation(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewWarehouseMemoryRepository()
	svc := NewWarehouseService(repo)

	// Warehouse with capacity 1000
	wh, err := svc.CreateWarehouse(ctx, models.CreateWarehouseRequest{
		Code:     "WH-LIMIT-01",
		Name:     "Depok WH",
		Address:  "Jl. Raya Pekapuran",
		City:     "Depok",
		Capacity: 1000,
	})
	if err != nil {
		t.Fatalf("failed to create warehouse: %v", err)
	}

	// Bin 1 with 500 -> SUCCESS (total 500 <= 1000)
	_, err = svc.CreateLocation(ctx, wh.ID, models.CreateLocationRequest{
		Zone:        "A",
		Rack:        "01",
		Shelf:       "01",
		Bin:         "A",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 500,
	})
	if err != nil {
		t.Fatalf("expected bin A to succeed, got %v", err)
	}

	// Bin 2 with 600 -> MUST FAIL (500 + 600 = 1100 > 1000)
	_, err = svc.CreateLocation(ctx, wh.ID, models.CreateLocationRequest{
		Zone:        "A",
		Rack:        "01",
		Shelf:       "01",
		Bin:         "B",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 600,
	})
	if err == nil {
		t.Fatalf("expected bin B with 600 to fail because 500 + 600 = 1100 > 1000, but succeeded")
	}

	// Bin 2 with 500 -> SUCCESS (500 + 500 = 1000 <= 1000)
	_, err = svc.CreateLocation(ctx, wh.ID, models.CreateLocationRequest{
		Zone:        "A",
		Rack:        "01",
		Shelf:       "01",
		Bin:         "B",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 500,
	})
	if err != nil {
		t.Fatalf("expected bin B with 500 to succeed, got %v", err)
	}
}

func TestWarehouseCapacityUpdateAndBinAllocation(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewWarehouseMemoryRepository()
	svc := NewWarehouseService(repo)

	// 1. Initial Warehouse with 1000 capacity
	wh, err := svc.CreateWarehouse(ctx, models.CreateWarehouseRequest{
		Code:     "WH-DEP-71",
		Name:     "Depok WH",
		Address:  "Jl. Raya Agus",
		City:     "Depok",
		Capacity: 1000,
	})
	if err != nil {
		t.Fatalf("failed to create warehouse: %v", err)
	}

	// 2. Add bin with 500 capacity -> Allocated: 500 / 1000
	_, err = svc.CreateLocation(ctx, wh.ID, models.CreateLocationRequest{
		Zone:        "A",
		Rack:        "01",
		Shelf:       "01",
		Bin:         "B",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 500,
	})
	if err != nil {
		t.Fatalf("failed to add bin B: %v", err)
	}

	// 3. Update warehouse capacity from 1000 to 10000
	updatedWh, err := svc.UpdateWarehouse(ctx, wh.ID, models.UpdateWarehouseRequest{
		Name:     "Depok WH",
		Address:  "Jl. Raya Agus",
		City:     "Depok",
		Capacity: 10000,
		IsActive: true,
	})
	if err != nil {
		t.Fatalf("failed to update warehouse capacity to 10000: %v", err)
	}
	if updatedWh.Capacity != 10000 {
		t.Fatalf("expected warehouse capacity 10000, got %d", updatedWh.Capacity)
	}

	// 4. Now adding a bin with 5000 capacity MUST SUCCEED (500 + 5000 = 5500 <= 10000)
	_, err = svc.CreateLocation(ctx, wh.ID, models.CreateLocationRequest{
		Zone:        "A",
		Rack:        "01",
		Shelf:       "01",
		Bin:         "A",
		Type:        models.LocationTypeShelf,
		MaxCapacity: 5000,
	})
	if err != nil {
		t.Fatalf("expected bin with 5000 capacity to succeed after warehouse capacity updated to 10000, got error: %v", err)
	}

	// 5. Try updating warehouse capacity to 4000 (which is less than total 5500 allocated) -> MUST FAIL
	_, err = svc.UpdateWarehouse(ctx, wh.ID, models.UpdateWarehouseRequest{
		Name:     "Depok WH",
		Address:  "Jl. Raya Agus",
		City:     "Depok",
		Capacity: 4000,
		IsActive: true,
	})
	if err == nil {
		t.Fatalf("expected downscaling warehouse capacity below allocated bins to fail, but succeeded")
	}
}
