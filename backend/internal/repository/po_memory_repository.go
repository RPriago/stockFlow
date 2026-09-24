package repository

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
)

type memoryPORepository struct {
	mu        sync.RWMutex
	suppliers map[primitive.ObjectID]*models.Supplier
	orders    map[primitive.ObjectID]*models.PurchaseOrder
}

func NewMemoryPORepository() PORepository {
	return &memoryPORepository{
		suppliers: make(map[primitive.ObjectID]*models.Supplier),
		orders:    make(map[primitive.ObjectID]*models.PurchaseOrder),
	}
}

// Supplier methods
func (r *memoryPORepository) CreateSupplier(ctx context.Context, s *models.Supplier) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, existing := range r.suppliers {
		if existing.Code == s.Code {
			return ErrSupplierCodeExists
		}
	}

	if s.ID.IsZero() {
		s.ID = primitive.NewObjectID()
	}
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now

	supplierCopy := *s
	r.suppliers[s.ID] = &supplierCopy
	return nil
}

func (r *memoryPORepository) FindSupplierByID(ctx context.Context, id primitive.ObjectID) (*models.Supplier, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	s, exists := r.suppliers[id]
	if !exists {
		return nil, ErrSupplierNotFound
	}
	sCopy := *s
	return &sCopy, nil
}

func (r *memoryPORepository) FindSupplierByCode(ctx context.Context, code string) (*models.Supplier, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, s := range r.suppliers {
		if strings.EqualFold(s.Code, code) {
			sCopy := *s
			return &sCopy, nil
		}
	}
	return nil, ErrSupplierNotFound
}

func (r *memoryPORepository) ListSuppliers(ctx context.Context) ([]models.Supplier, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	list := make([]models.Supplier, 0, len(r.suppliers))
	for _, s := range r.suppliers {
		list = append(list, *s)
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].Name < list[j].Name
	})
	return list, nil
}

func (r *memoryPORepository) UpdateSupplier(ctx context.Context, id primitive.ObjectID, s *models.Supplier) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.suppliers[id]
	if !exists {
		return ErrSupplierNotFound
	}

	for _, other := range r.suppliers {
		if other.ID != id && strings.EqualFold(other.Code, s.Code) {
			return ErrSupplierCodeExists
		}
	}

	existing.Code = s.Code
	existing.Name = s.Name
	existing.Email = s.Email
	existing.Phone = s.Phone
	existing.Address = s.Address
	existing.ContactPerson = s.ContactPerson
	existing.IsActive = s.IsActive
	existing.UpdatedAt = time.Now()

	return nil
}

func (r *memoryPORepository) DeleteSupplier(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.suppliers[id]; !exists {
		return ErrSupplierNotFound
	}
	delete(r.suppliers, id)
	return nil
}

func (r *memoryPORepository) CountSuppliers(ctx context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return int64(len(r.suppliers)), nil
}

// Purchase Order methods
func (r *memoryPORepository) CreatePO(ctx context.Context, po *models.PurchaseOrder) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, existing := range r.orders {
		if existing.OrderNumber == po.OrderNumber {
			return ErrPOOrderNumberExists
		}
	}

	if po.ID.IsZero() {
		po.ID = primitive.NewObjectID()
	}
	now := time.Now()
	po.CreatedAt = now
	po.UpdatedAt = now

	poCopy := *po
	r.orders[po.ID] = &poCopy
	return nil
}

func (r *memoryPORepository) FindPOByID(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	po, exists := r.orders[id]
	if !exists {
		return nil, ErrPONotFound
	}
	poCopy := *po
	return &poCopy, nil
}

func (r *memoryPORepository) FindPOByOrderNumber(ctx context.Context, orderNumber string) (*models.PurchaseOrder, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, po := range r.orders {
		if strings.EqualFold(po.OrderNumber, orderNumber) {
			poCopy := *po
			return &poCopy, nil
		}
	}
	return nil, ErrPONotFound
}

func (r *memoryPORepository) ListPOs(ctx context.Context, params models.POQueryParam) ([]models.PurchaseOrder, int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matched []models.PurchaseOrder
	searchLower := strings.ToLower(params.Search)

	for _, po := range r.orders {
		if params.Status != "" && string(po.Status) != params.Status {
			continue
		}
		if params.SupplierID != "" && po.SupplierID.Hex() != params.SupplierID {
			continue
		}
		if params.WarehouseID != "" && po.WarehouseID.Hex() != params.WarehouseID {
			continue
		}
		if searchLower != "" {
			numMatch := strings.Contains(strings.ToLower(po.OrderNumber), searchLower)
			supMatch := strings.Contains(strings.ToLower(po.SupplierName), searchLower)
			noteMatch := strings.Contains(strings.ToLower(po.Notes), searchLower)
			if !numMatch && !supMatch && !noteMatch {
				continue
			}
		}
		matched = append(matched, *po)
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
	if limit > 500 {
		limit = 500
	}
	page := int64(1)
	if params.Page > 0 {
		page = params.Page
	}

	start := (page - 1) * limit
	if start >= total {
		return []models.PurchaseOrder{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}

	return matched[start:end], total, nil
}

func (r *memoryPORepository) UpdatePO(ctx context.Context, id primitive.ObjectID, po *models.PurchaseOrder) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrPONotFound
	}
	if existing.Status != models.POStatusDraft {
		return ErrPOAlreadyLocked
	}

	existing.SupplierID = po.SupplierID
	existing.SupplierName = po.SupplierName
	existing.WarehouseID = po.WarehouseID
	existing.WarehouseName = po.WarehouseName
	existing.Items = po.Items
	existing.TotalQuantityOrdered = po.TotalQuantityOrdered
	existing.TotalAmount = po.TotalAmount
	existing.ExpectedDate = po.ExpectedDate
	existing.Notes = po.Notes
	existing.UpdatedAt = time.Now()

	return nil
}

func (r *memoryPORepository) UpdatePOStatus(ctx context.Context, id primitive.ObjectID, status models.POStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrPONotFound
	}

	existing.Status = status
	existing.UpdatedAt = time.Now()
	return nil
}

func (r *memoryPORepository) UpdatePOReceivedItems(ctx context.Context, id primitive.ObjectID, items []models.POItem, totalReceived int, newStatus models.POStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrPONotFound
	}

	existing.Items = items
	existing.TotalQuantityReceived = totalReceived
	existing.Status = newStatus
	existing.UpdatedAt = time.Now()
	return nil
}

func (r *memoryPORepository) DeletePO(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrPONotFound
	}
	if existing.Status != models.POStatusDraft {
		return errors.New("cannot delete purchase order: only draft orders can be deleted")
	}

	delete(r.orders, id)
	return nil
}

func (r *memoryPORepository) GetPOStats(ctx context.Context) (*models.POStatsResponse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	stats := &models.POStatsResponse{
		TotalOrders: int64(len(r.orders)),
	}

	for _, po := range r.orders {
		switch po.Status {
		case models.POStatusDraft:
			stats.DraftOrders++
		case models.POStatusOrdered, models.POStatusPartiallyReceived:
			stats.PendingOrders++
		case models.POStatusReceived:
			stats.CompletedOrders++
		case models.POStatusCancelled:
			stats.CancelledOrders++
		}

		if po.Status != models.POStatusCancelled {
			stats.TotalProcurement += po.TotalAmount
		}
	}

	return stats, nil
}
