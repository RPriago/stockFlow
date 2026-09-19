package repository

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
)

type memorySORepository struct {
	mu        sync.RWMutex
	customers map[primitive.ObjectID]*models.Customer
	orders    map[primitive.ObjectID]*models.SalesOrder
}

func NewMemorySORepository() SORepository {
	return &memorySORepository{
		customers: make(map[primitive.ObjectID]*models.Customer),
		orders:    make(map[primitive.ObjectID]*models.SalesOrder),
	}
}

// Customer methods
func (r *memorySORepository) CreateCustomer(ctx context.Context, c *models.Customer) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, existing := range r.customers {
		if existing.Code == c.Code {
			return ErrCustomerCodeExists
		}
	}

	if c.ID.IsZero() {
		c.ID = primitive.NewObjectID()
	}
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now

	customerCopy := *c
	r.customers[c.ID] = &customerCopy
	return nil
}

func (r *memorySORepository) FindCustomerByID(ctx context.Context, id primitive.ObjectID) (*models.Customer, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	c, exists := r.customers[id]
	if !exists {
		return nil, ErrCustomerNotFound
	}
	cCopy := *c
	return &cCopy, nil
}

func (r *memorySORepository) FindCustomerByCode(ctx context.Context, code string) (*models.Customer, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, c := range r.customers {
		if c.Code == code {
			cCopy := *c
			return &cCopy, nil
		}
	}
	return nil, ErrCustomerNotFound
}

func (r *memorySORepository) ListCustomers(ctx context.Context) ([]models.Customer, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Customer
	for _, c := range r.customers {
		result = append(result, *c)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result, nil
}

func (r *memorySORepository) UpdateCustomer(ctx context.Context, id primitive.ObjectID, c *models.Customer) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.customers[id]
	if !exists {
		return ErrCustomerNotFound
	}

	existing.Name = c.Name
	existing.Email = c.Email
	existing.Phone = c.Phone
	existing.Address = c.Address
	existing.City = c.City
	existing.IsActive = c.IsActive
	existing.UpdatedAt = time.Now()

	return nil
}

func (r *memorySORepository) DeleteCustomer(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.customers[id]; !exists {
		return ErrCustomerNotFound
	}
	delete(r.customers, id)
	return nil
}

func (r *memorySORepository) CountCustomers(ctx context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return int64(len(r.customers)), nil
}

// Sales Order methods
func (r *memorySORepository) CreateSO(ctx context.Context, so *models.SalesOrder) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, existing := range r.orders {
		if existing.OrderNumber == so.OrderNumber {
			return ErrSOOrderNumberExists
		}
	}

	if so.ID.IsZero() {
		so.ID = primitive.NewObjectID()
	}
	now := time.Now()
	so.CreatedAt = now
	so.UpdatedAt = now

	orderCopy := *so
	r.orders[so.ID] = &orderCopy
	return nil
}

func (r *memorySORepository) FindSOByID(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	so, exists := r.orders[id]
	if !exists {
		return nil, ErrSONotFound
	}
	orderCopy := *so
	return &orderCopy, nil
}

func (r *memorySORepository) FindSOByOrderNumber(ctx context.Context, orderNumber string) (*models.SalesOrder, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, so := range r.orders {
		if so.OrderNumber == orderNumber {
			orderCopy := *so
			return &orderCopy, nil
		}
	}
	return nil, ErrSONotFound
}

func (r *memorySORepository) ListSOs(ctx context.Context, params models.SOQueryParam) ([]models.SalesOrder, int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matched []models.SalesOrder
	searchLower := strings.ToLower(params.Search)

	for _, so := range r.orders {
		if params.Status != "" && string(so.Status) != params.Status {
			continue
		}
		if params.CustomerID != "" && so.CustomerID.Hex() != params.CustomerID {
			continue
		}
		if params.WarehouseID != "" && so.WarehouseID.Hex() != params.WarehouseID {
			continue
		}
		if searchLower != "" {
			match := strings.Contains(strings.ToLower(so.OrderNumber), searchLower) ||
				strings.Contains(strings.ToLower(so.CustomerName), searchLower) ||
				strings.Contains(strings.ToLower(so.TrackingNumber), searchLower) ||
				strings.Contains(strings.ToLower(so.Notes), searchLower)
			if !match {
				continue
			}
		}
		matched = append(matched, *so)
	}

	total := int64(len(matched))

	sort.Slice(matched, func(i, j int) bool {
		return matched[i].CreatedAt.After(matched[j].CreatedAt)
	})

	if params.Limit > 0 {
		start := (params.Page - 1) * params.Limit
		if start < 0 {
			start = 0
		}
		if start >= int64(len(matched)) {
			return []models.SalesOrder{}, total, nil
		}
		end := start + params.Limit
		if end > int64(len(matched)) {
			end = int64(len(matched))
		}
		matched = matched[start:end]
	}

	return matched, total, nil
}

func (r *memorySORepository) UpdateSO(ctx context.Context, id primitive.ObjectID, so *models.SalesOrder) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrSONotFound
	}
	if existing.Status != models.SOStatusDraft {
		return ErrSOAlreadyLocked
	}

	existing.ShippingAddress = so.ShippingAddress
	existing.Items = so.Items
	existing.TotalQuantity = so.TotalQuantity
	existing.TotalAmount = so.TotalAmount
	existing.Notes = so.Notes
	existing.UpdatedAt = time.Now()

	return nil
}

func (r *memorySORepository) UpdateSOStatus(ctx context.Context, id primitive.ObjectID, status models.SOStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrSONotFound
	}

	now := time.Now()
	existing.Status = status
	existing.UpdatedAt = now
	if status == models.SOStatusConfirmed {
		existing.ConfirmedAt = &now
	}

	return nil
}

func (r *memorySORepository) UpdateSODispatch(ctx context.Context, id primitive.ObjectID, carrier, trackingNumber string, shippedAt time.Time, newStatus models.SOStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrSONotFound
	}

	now := time.Now()
	existing.Carrier = carrier
	existing.TrackingNumber = trackingNumber
	existing.ShippedAt = &shippedAt
	existing.Status = newStatus
	existing.UpdatedAt = now

	return nil
}

func (r *memorySORepository) UpdateSODelivered(ctx context.Context, id primitive.ObjectID, deliveredAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrSONotFound
	}

	now := time.Now()
	existing.Status = models.SOStatusDelivered
	existing.DeliveredAt = &deliveredAt
	existing.UpdatedAt = now

	return nil
}

func (r *memorySORepository) DeleteSO(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.orders[id]
	if !exists {
		return ErrSONotFound
	}
	if existing.Status != models.SOStatusDraft {
		return ErrSOAlreadyLocked
	}

	delete(r.orders, id)
	return nil
}

func (r *memorySORepository) GetSOStats(ctx context.Context) (*models.SOStatsResponse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	stats := &models.SOStatsResponse{}
	stats.TotalOrders = int64(len(r.orders))

	for _, so := range r.orders {
		switch so.Status {
		case models.SOStatusDraft:
			stats.DraftOrders++
		case models.SOStatusConfirmed, models.SOStatusPicking, models.SOStatusPacking:
			stats.PendingFulfillment++
		case models.SOStatusShipped:
			stats.ShippedOrders++
		case models.SOStatusDelivered:
			stats.DeliveredOrders++
		case models.SOStatusCancelled:
			stats.CancelledOrders++
		}

		if so.Status != models.SOStatusCancelled {
			stats.TotalRevenue += so.TotalAmount
		}
	}

	return stats, nil
}
