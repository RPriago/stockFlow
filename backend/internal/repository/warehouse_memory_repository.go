package repository

import (
	"context"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
)

type warehouseMemoryRepository struct {
	mu         sync.RWMutex
	warehouses map[primitive.ObjectID]*models.Warehouse
	locations  map[primitive.ObjectID]*models.Location
}

func NewWarehouseMemoryRepository() WarehouseRepository {
	return &warehouseMemoryRepository{
		warehouses: make(map[primitive.ObjectID]*models.Warehouse),
		locations:  make(map[primitive.ObjectID]*models.Location),
	}
}

func (r *warehouseMemoryRepository) CreateWarehouse(ctx context.Context, wh *models.Warehouse) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, w := range r.warehouses {
		if strings.EqualFold(w.Code, wh.Code) {
			return ErrWarehouseCodeExists
		}
	}

	now := time.Now()
	wh.CreatedAt = now
	wh.UpdatedAt = now
	if wh.ID.IsZero() {
		wh.ID = primitive.NewObjectID()
	}

	copied := *wh
	r.warehouses[wh.ID] = &copied
	return nil
}

func (r *warehouseMemoryRepository) FindWarehouseByID(ctx context.Context, id primitive.ObjectID) (*models.Warehouse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	wh, exists := r.warehouses[id]
	if !exists {
		return nil, ErrWarehouseNotFound
	}
	copied := *wh
	return &copied, nil
}

func (r *warehouseMemoryRepository) FindWarehouseByCode(ctx context.Context, code string) (*models.Warehouse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, w := range r.warehouses {
		if strings.EqualFold(w.Code, code) {
			copied := *w
			return &copied, nil
		}
	}
	return nil, ErrWarehouseNotFound
}

func (r *warehouseMemoryRepository) FindWarehouses(ctx context.Context) ([]models.Warehouse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	res := make([]models.Warehouse, 0, len(r.warehouses))
	for _, w := range r.warehouses {
		copied := *w
		// Count bins
		binCount := 0
		for _, loc := range r.locations {
			if loc.WarehouseID == w.ID {
				binCount++
			}
		}
		copied.TotalBins = binCount
		res = append(res, copied)
	}
	return res, nil
}

func (r *warehouseMemoryRepository) UpdateWarehouse(ctx context.Context, id primitive.ObjectID, wh *models.Warehouse) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.warehouses[id]
	if !exists {
		return ErrWarehouseNotFound
	}

	for otherID, w := range r.warehouses {
		if otherID != id && strings.EqualFold(w.Code, wh.Code) {
			return ErrWarehouseCodeExists
		}
	}

	wh.ID = id
	wh.CreatedAt = existing.CreatedAt
	wh.UpdatedAt = time.Now()
	copied := *wh
	r.warehouses[id] = &copied
	return nil
}

func (r *warehouseMemoryRepository) DeleteWarehouse(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.warehouses[id]; !exists {
		return ErrWarehouseNotFound
	}
	delete(r.warehouses, id)

	// Delete child locations
	for locID, loc := range r.locations {
		if loc.WarehouseID == id {
			delete(r.locations, locID)
		}
	}
	return nil
}

func (r *warehouseMemoryRepository) CountWarehouses(ctx context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return int64(len(r.warehouses)), nil
}

func (r *warehouseMemoryRepository) CreateLocation(ctx context.Context, loc *models.Location) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, l := range r.locations {
		if l.WarehouseID == loc.WarehouseID && strings.EqualFold(l.Code, loc.Code) {
			return ErrLocationCodeExists
		}
	}

	now := time.Now()
	loc.CreatedAt = now
	if loc.ID.IsZero() {
		loc.ID = primitive.NewObjectID()
	}

	copied := *loc
	r.locations[loc.ID] = &copied
	return nil
}

func (r *warehouseMemoryRepository) FindLocationsByWarehouse(ctx context.Context, warehouseID primitive.ObjectID) ([]models.Location, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	res := make([]models.Location, 0)
	for _, l := range r.locations {
		if l.WarehouseID == warehouseID {
			res = append(res, *l)
		}
	}
	return res, nil
}

func (r *warehouseMemoryRepository) FindLocationByID(ctx context.Context, id primitive.ObjectID) (*models.Location, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	loc, exists := r.locations[id]
	if !exists {
		return nil, ErrLocationNotFound
	}
	copied := *loc
	return &copied, nil
}

func (r *warehouseMemoryRepository) FindLocationByCode(ctx context.Context, warehouseID primitive.ObjectID, code string) (*models.Location, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, l := range r.locations {
		if l.WarehouseID == warehouseID && strings.EqualFold(l.Code, code) {
			copied := *l
			return &copied, nil
		}
	}
	return nil, ErrLocationNotFound
}

func (r *warehouseMemoryRepository) DeleteLocation(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.locations[id]; !exists {
		return ErrLocationNotFound
	}
	delete(r.locations, id)
	return nil
}

func (r *warehouseMemoryRepository) CountLocationsByWarehouse(ctx context.Context, warehouseID primitive.ObjectID) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	count := int64(0)
	for _, l := range r.locations {
		if l.WarehouseID == warehouseID {
			count++
		}
	}
	return count, nil
}
