package repository

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
)

type memoryInventoryRepository struct {
	mu        sync.RWMutex
	items     map[string]*models.InventoryItem
	movements []models.InventoryMovement
}

func NewMemoryInventoryRepository() InventoryRepository {
	return &memoryInventoryRepository{
		items:     make(map[string]*models.InventoryItem),
		movements: make([]models.InventoryMovement, 0),
	}
}

func itemKey(warehouseID, locationID, productID primitive.ObjectID, variantID string) string {
	return fmt.Sprintf("%s:%s:%s:%s", warehouseID.Hex(), locationID.Hex(), productID.Hex(), variantID)
}

func (r *memoryInventoryRepository) StockIn(ctx context.Context, item *models.InventoryItem, qty int) (*models.InventoryItem, int, error) {
	if qty <= 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	key := itemKey(item.WarehouseID, item.LocationID, item.ProductID, item.VariantID)
	now := time.Now()

	existing, exists := r.items[key]
	balanceBefore := 0
	if exists {
		balanceBefore = existing.QuantityOnHand
		existing.QuantityOnHand += qty
		existing.QuantityAvailable += qty
		existing.ProductName = item.ProductName
		existing.SKU = item.SKU
		existing.WarehouseName = item.WarehouseName
		existing.LocationCode = item.LocationCode
		existing.MinStock = item.MinStock
		existing.Unit = item.Unit
		existing.UpdatedAt = now
		itemCopy := *existing
		return &itemCopy, balanceBefore, nil
	}

	newItem := *item
	if newItem.ID.IsZero() {
		newItem.ID = primitive.NewObjectID()
	}
	newItem.QuantityOnHand = qty
	newItem.QuantityReserved = 0
	newItem.QuantityAvailable = qty
	newItem.UpdatedAt = now

	r.items[key] = &newItem
	itemCopy := newItem
	return &itemCopy, 0, nil
}

func (r *memoryInventoryRepository) StockOut(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, int, error) {
	if qty <= 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	key := itemKey(warehouseID, locationID, productID, variantID)
	existing, exists := r.items[key]
	if !exists {
		return nil, 0, ErrInventoryNotFound
	}

	if existing.QuantityAvailable < qty {
		return nil, existing.QuantityOnHand, ErrInsufficientStock
	}

	balanceBefore := existing.QuantityOnHand
	existing.QuantityOnHand -= qty
	existing.QuantityAvailable -= qty
	existing.UpdatedAt = time.Now()

	itemCopy := *existing
	return &itemCopy, balanceBefore, nil
}

func (r *memoryInventoryRepository) AdjustStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, actualQty int) (*models.InventoryItem, int, error) {
	if actualQty < 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	key := itemKey(warehouseID, locationID, productID, variantID)
	existing, exists := r.items[key]
	if !exists {
		return nil, 0, ErrInventoryNotFound
	}

	if actualQty < existing.QuantityReserved {
		return nil, existing.QuantityOnHand, ErrCannotAdjustBelowReserved
	}

	balanceBefore := existing.QuantityOnHand
	existing.QuantityOnHand = actualQty
	existing.QuantityAvailable = actualQty - existing.QuantityReserved
	existing.UpdatedAt = time.Now()

	itemCopy := *existing
	return &itemCopy, balanceBefore, nil
}

func (r *memoryInventoryRepository) ReserveStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, error) {
	if qty <= 0 {
		return nil, ErrInvalidStockAmount
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	key := itemKey(warehouseID, locationID, productID, variantID)
	existing, exists := r.items[key]
	if !exists {
		return nil, ErrInventoryNotFound
	}

	if existing.QuantityAvailable < qty {
		return nil, ErrInsufficientStock
	}

	existing.QuantityReserved += qty
	existing.QuantityAvailable -= qty
	existing.UpdatedAt = time.Now()

	itemCopy := *existing
	return &itemCopy, nil
}

func (r *memoryInventoryRepository) ReleaseStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, error) {
	if qty <= 0 {
		return nil, ErrInvalidStockAmount
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	key := itemKey(warehouseID, locationID, productID, variantID)
	existing, exists := r.items[key]
	if !exists {
		return nil, ErrInventoryNotFound
	}

	if existing.QuantityReserved < qty {
		return nil, ErrInvalidStockAmount
	}

	existing.QuantityReserved -= qty
	existing.QuantityAvailable += qty
	existing.UpdatedAt = time.Now()

	itemCopy := *existing
	return &itemCopy, nil
}

func (r *memoryInventoryRepository) DeductReservedStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, int, error) {
	if qty <= 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	key := itemKey(warehouseID, locationID, productID, variantID)
	existing, exists := r.items[key]
	if !exists {
		return nil, 0, ErrInventoryNotFound
	}

	if existing.QuantityReserved < qty {
		return nil, existing.QuantityOnHand, ErrInsufficientStock
	}

	balanceBefore := existing.QuantityOnHand
	existing.QuantityOnHand -= qty
	existing.QuantityReserved -= qty
	existing.UpdatedAt = time.Now()

	itemCopy := *existing
	return &itemCopy, balanceBefore, nil
}

func (r *memoryInventoryRepository) FindItem(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string) (*models.InventoryItem, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	key := itemKey(warehouseID, locationID, productID, variantID)
	item, exists := r.items[key]
	if !exists {
		return nil, ErrInventoryNotFound
	}

	itemCopy := *item
	return &itemCopy, nil
}

func (r *memoryInventoryRepository) FindItemByID(ctx context.Context, id primitive.ObjectID) (*models.InventoryItem, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, item := range r.items {
		if item.ID == id {
			itemCopy := *item
			return &itemCopy, nil
		}
	}
	return nil, ErrInventoryNotFound
}

func (r *memoryInventoryRepository) FindItems(ctx context.Context, params models.InventoryQueryParam) ([]models.InventoryItem, int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matched []models.InventoryItem
	searchLower := strings.ToLower(params.Search)

	for _, item := range r.items {
		if params.WarehouseID != "" && item.WarehouseID.Hex() != params.WarehouseID {
			continue
		}
		if params.LocationID != "" && item.LocationID.Hex() != params.LocationID {
			continue
		}
		if params.ProductID != "" && item.ProductID.Hex() != params.ProductID {
			continue
		}
		if params.LowStockOnly && item.QuantityAvailable > item.MinStock {
			continue
		}
		if searchLower != "" {
			nameMatch := strings.Contains(strings.ToLower(item.ProductName), searchLower)
			skuMatch := strings.Contains(strings.ToLower(item.SKU), searchLower)
			locMatch := strings.Contains(strings.ToLower(item.LocationCode), searchLower)
			if !nameMatch && !skuMatch && !locMatch {
				continue
			}
		}
		matched = append(matched, *item)
	}

	sort.Slice(matched, func(i, j int) bool {
		return matched[i].ProductName < matched[j].ProductName
	})

	total := int64(len(matched))
	limit := int64(20)
	if params.Limit > 0 {
		limit = params.Limit
	}
	page := int64(1)
	if params.Page > 0 {
		page = params.Page
	}

	start := (page - 1) * limit
	if start >= total {
		return []models.InventoryItem{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}

	return matched[start:end], total, nil
}

func (r *memoryInventoryRepository) RecordMovement(ctx context.Context, movement *models.InventoryMovement) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	newMov := *movement
	if newMov.ID.IsZero() {
		newMov.ID = primitive.NewObjectID()
	}
	if newMov.CreatedAt.IsZero() {
		newMov.CreatedAt = time.Now()
	}

	r.movements = append(r.movements, newMov)
	return nil
}

func (r *memoryInventoryRepository) FindMovements(ctx context.Context, params models.MovementQueryParam) ([]models.InventoryMovement, int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matched []models.InventoryMovement
	for _, m := range r.movements {
		if params.WarehouseID != "" && m.WarehouseID.Hex() != params.WarehouseID {
			continue
		}
		if params.ProductID != "" && m.ProductID.Hex() != params.ProductID {
			continue
		}
		if params.MovementType != "" && string(m.MovementType) != params.MovementType {
			continue
		}
		matched = append(matched, m)
	}

	// Sort newest first
	sort.Slice(matched, func(i, j int) bool {
		return matched[i].CreatedAt.After(matched[j].CreatedAt)
	})

	total := int64(len(matched))
	limit := int64(20)
	if params.Limit > 0 {
		limit = params.Limit
	}
	page := int64(1)
	if params.Page > 0 {
		page = params.Page
	}

	start := (page - 1) * limit
	if start >= total {
		return []models.InventoryMovement{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}

	return matched[start:end], total, nil
}

func (r *memoryInventoryRepository) GetStats(ctx context.Context) (*models.InventoryStatsResponse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	stats := &models.InventoryStatsResponse{
		TotalItemsCount: int64(len(r.items)),
	}

	for _, item := range r.items {
		stats.TotalOnHand += item.QuantityOnHand
		stats.TotalAvailable += item.QuantityAvailable
		stats.TotalReserved += item.QuantityReserved
		if item.QuantityAvailable <= item.MinStock {
			stats.LowStockItemsCount++
		}
	}

	startOfDay := time.Now().Truncate(24 * time.Hour)
	for _, m := range r.movements {
		if m.CreatedAt.After(startOfDay) || m.CreatedAt.Equal(startOfDay) {
			stats.MovementsToday++
		}
	}

	return stats, nil
}
