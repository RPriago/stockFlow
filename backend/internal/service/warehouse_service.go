package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type WarehouseService interface {
	CreateWarehouse(ctx context.Context, req models.CreateWarehouseRequest) (*models.Warehouse, error)
	GetWarehouseByID(ctx context.Context, id primitive.ObjectID) (*models.Warehouse, error)
	ListWarehouses(ctx context.Context) ([]models.Warehouse, error)
	UpdateWarehouse(ctx context.Context, id primitive.ObjectID, req models.UpdateWarehouseRequest) (*models.Warehouse, error)
	DeleteWarehouse(ctx context.Context, id primitive.ObjectID) error

	CreateLocation(ctx context.Context, warehouseID primitive.ObjectID, req models.CreateLocationRequest) (*models.Location, error)
	ListLocations(ctx context.Context, warehouseID primitive.ObjectID) ([]models.Location, error)
	DeleteLocation(ctx context.Context, id primitive.ObjectID) error

	SeedInitialWarehouses(ctx context.Context) error
}

type warehouseService struct {
	repo  repository.WarehouseRepository
	locMu sync.Mutex
}

func NewWarehouseService(repo repository.WarehouseRepository) WarehouseService {
	return &warehouseService{repo: repo}
}

func (s *warehouseService) CreateWarehouse(ctx context.Context, req models.CreateWarehouseRequest) (*models.Warehouse, error) {
	code := strings.TrimSpace(req.Code)
	if code == "" {
		cityPrefix := "WH"
		if len(req.City) >= 3 {
			cityPrefix = "WH-" + strings.ToUpper(req.City[:3])
		}
		randomBytes := make([]byte, 2)
		_, _ = rand.Read(randomBytes)
		code = fmt.Sprintf("%s-%s", cityPrefix, strings.ToUpper(hex.EncodeToString(randomBytes)))
	}

	if _, err := s.repo.FindWarehouseByCode(ctx, code); err == nil {
		return nil, repository.ErrWarehouseCodeExists
	}

	wh := &models.Warehouse{
		Code:     code,
		Name:     req.Name,
		Address:  req.Address,
		City:     req.City,
		Capacity: req.Capacity,
		IsActive: true,
	}

	if err := s.repo.CreateWarehouse(ctx, wh); err != nil {
		return nil, err
	}

	return wh, nil
}

func (s *warehouseService) GetWarehouseByID(ctx context.Context, id primitive.ObjectID) (*models.Warehouse, error) {
	return s.repo.FindWarehouseByID(ctx, id)
}

func (s *warehouseService) ListWarehouses(ctx context.Context) ([]models.Warehouse, error) {
	return s.repo.FindWarehouses(ctx)
}

func (s *warehouseService) UpdateWarehouse(ctx context.Context, id primitive.ObjectID, req models.UpdateWarehouseRequest) (*models.Warehouse, error) {
	existing, err := s.repo.FindWarehouseByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Validate that new capacity is not less than total capacity already allocated to bins
	if req.Capacity > 0 {
		existingLocs, errLoc := s.repo.FindLocationsByWarehouse(ctx, id)
		if errLoc == nil {
			totalAllocated := 0
			for _, l := range existingLocs {
				totalAllocated += l.MaxCapacity
			}
			if req.Capacity < totalAllocated {
				return nil, fmt.Errorf("kapasitas baru (%d unit) tidak boleh lebih kecil dari total kapasitas rak yang sudah dialokasikan (%d unit)", req.Capacity, totalAllocated)
			}
		}
	}

	code := strings.TrimSpace(req.Code)
	if code == "" {
		code = existing.Code
	}

	existing.Code = code
	existing.Name = req.Name
	existing.Address = req.Address
	existing.City = req.City
	existing.Capacity = req.Capacity
	existing.IsActive = req.IsActive
	if req.IsActive {
		existing.IsActive = true
	} else if existing.IsActive {
		existing.IsActive = true
	}

	if err := s.repo.UpdateWarehouse(ctx, id, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

func (s *warehouseService) DeleteWarehouse(ctx context.Context, id primitive.ObjectID) error {
	return s.repo.DeleteWarehouse(ctx, id)
}

func (s *warehouseService) CreateLocation(ctx context.Context, warehouseID primitive.ObjectID, req models.CreateLocationRequest) (*models.Location, error) {
	s.locMu.Lock()
	defer s.locMu.Unlock()

	// Verify warehouse exists
	wh, err := s.repo.FindWarehouseByID(ctx, warehouseID)
	if err != nil {
		return nil, errors.New("parent warehouse not found")
	}

	// Validate warehouse capacity vs allocated bin capacities
	if wh.Capacity > 0 {
		existingLocs, err := s.repo.FindLocationsByWarehouse(ctx, warehouseID)
		if err == nil {
			totalAllocated := 0
			for _, l := range existingLocs {
				totalAllocated += l.MaxCapacity
			}
			if totalAllocated+req.MaxCapacity > wh.Capacity {
				avail := wh.Capacity - totalAllocated
				if avail < 0 {
					avail = 0
				}
				return nil, fmt.Errorf("melebihi kapasitas gudang: Kapasitas total gudang '%s' adalah %d unit (sudah teralokasi ke rak lain: %d unit, sisa kapasitas yang dapat dialokasikan: %d unit, mencoba menambah rak berkapasitas: %d unit)", wh.Name, wh.Capacity, totalAllocated, avail, req.MaxCapacity)
			}
		}
	}

	// Code format: {Zone}-{Rack}-{Shelf}-{Bin}
	code := fmt.Sprintf("%s-%s-%s-%s",
		strings.ToUpper(strings.TrimSpace(req.Zone)),
		strings.ToUpper(strings.TrimSpace(req.Rack)),
		strings.ToUpper(strings.TrimSpace(req.Shelf)),
		strings.ToUpper(strings.TrimSpace(req.Bin)),
	)

	if _, err := s.repo.FindLocationByCode(ctx, warehouseID, code); err == nil {
		return nil, repository.ErrLocationCodeExists
	}

	loc := &models.Location{
		WarehouseID: warehouseID,
		Code:        code,
		Zone:        req.Zone,
		Rack:        req.Rack,
		Shelf:       req.Shelf,
		Bin:         req.Bin,
		Type:        req.Type,
		MaxCapacity: req.MaxCapacity,
		IsActive:    true,
	}

	if err := s.repo.CreateLocation(ctx, loc); err != nil {
		return nil, err
	}

	return loc, nil
}

func (s *warehouseService) ListLocations(ctx context.Context, warehouseID primitive.ObjectID) ([]models.Location, error) {
	return s.repo.FindLocationsByWarehouse(ctx, warehouseID)
}

func (s *warehouseService) DeleteLocation(ctx context.Context, id primitive.ObjectID) error {
	return s.repo.DeleteLocation(ctx, id)
}

func (s *warehouseService) SeedInitialWarehouses(ctx context.Context) error {
	count, err := s.repo.CountWarehouses(ctx)
	if err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	log.Println("Seeding initial Warehouses and storage Bins...")

	facilities := []struct {
		Wh   models.CreateWarehouseRequest
		Bins []models.CreateLocationRequest
	}{
		{
			Wh: models.CreateWarehouseRequest{
				Code:     "WH-JKT-01",
				Name:     "Jakarta Central Fulfillment",
				Address:  "Jl. Raya Daan Mogot KM 12, Kalideres",
				City:     "Jakarta Barat",
				Capacity: 50000,
			},
			Bins: []models.CreateLocationRequest{
				{Zone: "A", Rack: "01", Shelf: "01", Bin: "A", Type: models.LocationTypeShelf, MaxCapacity: 500},
				{Zone: "A", Rack: "01", Shelf: "01", Bin: "B", Type: models.LocationTypeShelf, MaxCapacity: 500},
				{Zone: "A", Rack: "01", Shelf: "02", Bin: "A", Type: models.LocationTypeShelf, MaxCapacity: 500},
				{Zone: "B", Rack: "01", Shelf: "01", Bin: "P1", Type: models.LocationTypePalletRack, MaxCapacity: 2000},
				{Zone: "B", Rack: "01", Shelf: "01", Bin: "P2", Type: models.LocationTypePalletRack, MaxCapacity: 2000},
				{Zone: "C", Rack: "01", Shelf: "01", Bin: "S1", Type: models.LocationTypeStaging, MaxCapacity: 5000},
			},
		},
		{
			Wh: models.CreateWarehouseRequest{
				Code:     "WH-SUB-02",
				Name:     "Surabaya Logistics Hub",
				Address:  "Kawasan Industri Rungkut Megah No. 8",
				City:     "Surabaya",
				Capacity: 35000,
			},
			Bins: []models.CreateLocationRequest{
				{Zone: "A", Rack: "01", Shelf: "01", Bin: "A", Type: models.LocationTypeShelf, MaxCapacity: 600},
				{Zone: "A", Rack: "01", Shelf: "02", Bin: "A", Type: models.LocationTypeShelf, MaxCapacity: 600},
				{Zone: "B", Rack: "01", Shelf: "01", Bin: "P1", Type: models.LocationTypePalletRack, MaxCapacity: 1800},
			},
		},
		{
			Wh: models.CreateWarehouseRequest{
				Code:     "WH-BDO-03",
				Name:     "Bandung Distribution Center",
				Address:  "Jl. Soekarno-Hatta No. 542, Batununggal",
				City:     "Bandung",
				Capacity: 20000,
			},
			Bins: []models.CreateLocationRequest{
				{Zone: "A", Rack: "01", Shelf: "01", Bin: "A", Type: models.LocationTypeShelf, MaxCapacity: 400},
				{Zone: "B", Rack: "01", Shelf: "01", Bin: "P1", Type: models.LocationTypePalletRack, MaxCapacity: 1200},
			},
		},
	}

	for _, item := range facilities {
		wh, err := s.CreateWarehouse(ctx, item.Wh)
		if err == nil && wh != nil {
			for _, bin := range item.Bins {
				_, _ = s.CreateLocation(ctx, wh.ID, bin)
			}
		}
	}

	log.Println("Warehouses and Bins successfully seeded.")
	return nil
}
