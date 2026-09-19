package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
)

type SOService interface {
	// Customer CRUD
	CreateCustomer(ctx context.Context, req models.CreateCustomerRequest) (*models.Customer, error)
	GetCustomerByID(ctx context.Context, id primitive.ObjectID) (*models.Customer, error)
	ListCustomers(ctx context.Context) ([]models.Customer, error)
	UpdateCustomer(ctx context.Context, id primitive.ObjectID, req models.UpdateCustomerRequest) (*models.Customer, error)
	DeleteCustomer(ctx context.Context, id primitive.ObjectID) error

	// Sales Order lifecycle
	CreateSO(ctx context.Context, req models.CreateSORequest, userID, userName string) (*models.SalesOrder, error)
	GetSOByID(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error)
	ListSOs(ctx context.Context, params models.SOQueryParam) ([]models.SalesOrder, int64, error)
	UpdateSO(ctx context.Context, id primitive.ObjectID, req models.UpdateSORequest) (*models.SalesOrder, error)
	ConfirmSO(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error)
	StartPicking(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error)
	StartPacking(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error)
	DispatchSO(ctx context.Context, id primitive.ObjectID, req models.DispatchSORequest, userID, userName string) (*models.SalesOrder, error)
	DeliverSO(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error)
	CancelSO(ctx context.Context, id primitive.ObjectID, userID, userName string) (*models.SalesOrder, error)
	DeleteSO(ctx context.Context, id primitive.ObjectID) error
	GetSOStats(ctx context.Context) (*models.SOStatsResponse, error)

	SeedInitialCustomersAndSOs(ctx context.Context) error
}

type soService struct {
	soRepo           repository.SORepository
	productRepo      repository.ProductRepository
	warehouseRepo    repository.WarehouseRepository
	inventoryService InventoryService
}

func NewSOService(
	soRepo repository.SORepository,
	productRepo repository.ProductRepository,
	warehouseRepo repository.WarehouseRepository,
	inventoryService InventoryService,
) SOService {
	return &soService{
		soRepo:           soRepo,
		productRepo:      productRepo,
		warehouseRepo:    warehouseRepo,
		inventoryService: inventoryService,
	}
}

// Customer implementation
func (s *soService) CreateCustomer(ctx context.Context, req models.CreateCustomerRequest) (*models.Customer, error) {
	code := req.Code
	if code == "" {
		code = fmt.Sprintf("CUST-%04d", rand.Intn(9000)+1000)
	}

	customer := &models.Customer{
		Code:     code,
		Name:     req.Name,
		Email:    req.Email,
		Phone:    req.Phone,
		Address:  req.Address,
		City:     req.City,
		IsActive: true,
	}

	if err := s.soRepo.CreateCustomer(ctx, customer); err != nil {
		return nil, err
	}
	return customer, nil
}

func (s *soService) GetCustomerByID(ctx context.Context, id primitive.ObjectID) (*models.Customer, error) {
	return s.soRepo.FindCustomerByID(ctx, id)
}

func (s *soService) ListCustomers(ctx context.Context) ([]models.Customer, error) {
	return s.soRepo.ListCustomers(ctx)
}

func (s *soService) UpdateCustomer(ctx context.Context, id primitive.ObjectID, req models.UpdateCustomerRequest) (*models.Customer, error) {
	existing, err := s.soRepo.FindCustomerByID(ctx, id)
	if err != nil {
		return nil, err
	}

	existing.Name = req.Name
	existing.Email = req.Email
	existing.Phone = req.Phone
	existing.Address = req.Address
	existing.City = req.City
	if req.IsActive != nil {
		existing.IsActive = *req.IsActive
	}

	if err := s.soRepo.UpdateCustomer(ctx, id, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *soService) DeleteCustomer(ctx context.Context, id primitive.ObjectID) error {
	return s.soRepo.DeleteCustomer(ctx, id)
}

// Sales Order implementation
func (s *soService) CreateSO(ctx context.Context, req models.CreateSORequest, userID, userName string) (*models.SalesOrder, error) {
	custID, err := primitive.ObjectIDFromHex(req.CustomerID)
	if err != nil {
		return nil, errors.New("invalid customer id")
	}

	customer, err := s.soRepo.FindCustomerByID(ctx, custID)
	if err != nil {
		return nil, fmt.Errorf("customer error: %w", err)
	}

	whID, err := primitive.ObjectIDFromHex(req.WarehouseID)
	if err != nil {
		return nil, errors.New("invalid warehouse id")
	}

	wh, err := s.warehouseRepo.FindWarehouseByID(ctx, whID)
	if err != nil {
		return nil, fmt.Errorf("warehouse error: %w", err)
	}

	if len(req.Items) == 0 {
		return nil, errors.New("sales order must contain at least one line item")
	}

	// Fetch locations for warehouse to validate & get location codes
	locations, err := s.warehouseRepo.FindLocationsByWarehouse(ctx, whID)
	if err != nil {
		return nil, fmt.Errorf("failed to load warehouse locations: %w", err)
	}
	locMap := make(map[primitive.ObjectID]models.Location)
	for _, l := range locations {
		locMap[l.ID] = l
	}

	var soItems []models.SOItem
	var totalQty int
	var totalAmount float64

	for _, itemReq := range req.Items {
		if itemReq.QuantityOrdered <= 0 {
			return nil, errors.New("quantity ordered must be greater than zero")
		}
		if itemReq.UnitPrice < 0 {
			return nil, errors.New("unit price cannot be negative")
		}

		pID, err := primitive.ObjectIDFromHex(itemReq.ProductID)
		if err != nil {
			return nil, errors.New("invalid product id")
		}

		prod, err := s.productRepo.FindProductByID(ctx, pID)
		if err != nil {
			return nil, fmt.Errorf("product not found: %s", itemReq.ProductID)
		}

		lID, err := primitive.ObjectIDFromHex(itemReq.LocationID)
		if err != nil {
			return nil, errors.New("invalid location id")
		}

		loc, ok := locMap[lID]
		if !ok {
			return nil, fmt.Errorf("location %s does not belong to warehouse %s", itemReq.LocationID, wh.Name)
		}

		productName := prod.Name
		sku := prod.SKU
		if itemReq.VariantID != "" {
			for _, v := range prod.Variants {
				if v.ID == itemReq.VariantID {
					productName = fmt.Sprintf("%s (%s)", prod.Name, v.Name)
					sku = v.SKU
					break
				}
			}
		}

		subtotal := float64(itemReq.QuantityOrdered) * itemReq.UnitPrice
		totalQty += itemReq.QuantityOrdered
		totalAmount += subtotal

		soItems = append(soItems, models.SOItem{
			ProductID:       pID,
			VariantID:       itemReq.VariantID,
			ProductName:     productName,
			SKU:             sku,
			Unit:            prod.Unit,
			LocationID:      lID,
			LocationCode:    loc.Code,
			QuantityOrdered: itemReq.QuantityOrdered,
			UnitPrice:       itemReq.UnitPrice,
			Subtotal:        subtotal,
		})
	}

	now := time.Now()
	orderNumber := fmt.Sprintf("SO-%s-%04d", now.Format("20060102"), rand.Intn(9000)+1000)

	shippingAddr := req.ShippingAddress
	if shippingAddr == "" {
		shippingAddr = customer.Address
		if customer.City != "" {
			shippingAddr += ", " + customer.City
		}
	}

	so := &models.SalesOrder{
		OrderNumber:     orderNumber,
		CustomerID:      customer.ID,
		CustomerName:    customer.Name,
		WarehouseID:     wh.ID,
		WarehouseName:   wh.Name,
		Status:          models.SOStatusDraft,
		Items:           soItems,
		TotalQuantity:   totalQty,
		TotalAmount:     totalAmount,
		ShippingAddress: shippingAddr,
		Notes:           req.Notes,
		CreatedBy:       userID,
		CreatedByName:   userName,
	}

	if err := s.soRepo.CreateSO(ctx, so); err != nil {
		return nil, err
	}
	return so, nil
}

func (s *soService) GetSOByID(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error) {
	return s.soRepo.FindSOByID(ctx, id)
}

func (s *soService) ListSOs(ctx context.Context, params models.SOQueryParam) ([]models.SalesOrder, int64, error) {
	return s.soRepo.ListSOs(ctx, params)
}

func (s *soService) UpdateSO(ctx context.Context, id primitive.ObjectID, req models.UpdateSORequest) (*models.SalesOrder, error) {
	existing, err := s.soRepo.FindSOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing.Status != models.SOStatusDraft {
		return nil, repository.ErrSOAlreadyLocked
	}

	if req.ShippingAddress != "" {
		existing.ShippingAddress = req.ShippingAddress
	}
	if req.Notes != "" {
		existing.Notes = req.Notes
	}

	if len(req.Items) > 0 {
		locations, err := s.warehouseRepo.FindLocationsByWarehouse(ctx, existing.WarehouseID)
		if err != nil {
			return nil, err
		}
		locMap := make(map[primitive.ObjectID]models.Location)
		for _, l := range locations {
			locMap[l.ID] = l
		}

		var soItems []models.SOItem
		var totalQty int
		var totalAmount float64

		for _, itemReq := range req.Items {
			if itemReq.QuantityOrdered <= 0 {
				return nil, errors.New("quantity ordered must be greater than zero")
			}
			pID, err := primitive.ObjectIDFromHex(itemReq.ProductID)
			if err != nil {
				return nil, errors.New("invalid product id")
			}
			prod, err := s.productRepo.FindProductByID(ctx, pID)
			if err != nil {
				return nil, fmt.Errorf("product not found: %s", itemReq.ProductID)
			}

			lID, err := primitive.ObjectIDFromHex(itemReq.LocationID)
			if err != nil {
				return nil, errors.New("invalid location id")
			}
			loc, ok := locMap[lID]
			if !ok {
				return nil, fmt.Errorf("location %s does not belong to warehouse", itemReq.LocationID)
			}

			productName := prod.Name
			sku := prod.SKU
			if itemReq.VariantID != "" {
				for _, v := range prod.Variants {
					if v.ID == itemReq.VariantID {
						productName = fmt.Sprintf("%s (%s)", prod.Name, v.Name)
						sku = v.SKU
						break
					}
				}
			}

			subtotal := float64(itemReq.QuantityOrdered) * itemReq.UnitPrice
			totalQty += itemReq.QuantityOrdered
			totalAmount += subtotal

			soItems = append(soItems, models.SOItem{
				ProductID:       pID,
				VariantID:       itemReq.VariantID,
				ProductName:     productName,
				SKU:             sku,
				Unit:            prod.Unit,
				LocationID:      lID,
				LocationCode:    loc.Code,
				QuantityOrdered: itemReq.QuantityOrdered,
				UnitPrice:       itemReq.UnitPrice,
				Subtotal:        subtotal,
			})
		}
		existing.Items = soItems
		existing.TotalQuantity = totalQty
		existing.TotalAmount = totalAmount
	}

	if err := s.soRepo.UpdateSO(ctx, id, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

// ConfirmSO: Locks order and atomically reserves stock for all line items
func (s *soService) ConfirmSO(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error) {
	so, err := s.soRepo.FindSOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if so.Status != models.SOStatusDraft {
		return nil, fmt.Errorf("cannot confirm order in status %s: only draft orders can be confirmed", so.Status)
	}

	// Try reserving stock item by item. Keep track of successes so we can rollback if one fails!
	var reservedItems []models.SOItem
	for _, item := range so.Items {
		_, err := s.inventoryService.ReserveStock(
			ctx,
			so.WarehouseID,
			item.LocationID,
			item.ProductID,
			item.VariantID,
			item.QuantityOrdered,
			"so",
			so.OrderNumber,
			so.CreatedBy,
			so.CreatedByName,
		)
		if err != nil {
			// Rollback previously reserved items in this order
			for _, prev := range reservedItems {
				_, _ = s.inventoryService.ReleaseStock(
					ctx,
					so.WarehouseID,
					prev.LocationID,
					prev.ProductID,
					prev.VariantID,
					prev.QuantityOrdered,
					"so",
					so.OrderNumber,
					so.CreatedBy,
					so.CreatedByName,
				)
			}
			return nil, fmt.Errorf("insufficient available stock to fulfill %d units of %s (%s) at Bin %s: %w",
				item.QuantityOrdered, item.ProductName, item.SKU, item.LocationCode, err)
		}
		reservedItems = append(reservedItems, item)
	}

	if err := s.soRepo.UpdateSOStatus(ctx, id, models.SOStatusConfirmed); err != nil {
		// Rollback reservations
		for _, prev := range reservedItems {
			_, _ = s.inventoryService.ReleaseStock(
				ctx,
				so.WarehouseID,
				prev.LocationID,
				prev.ProductID,
				prev.VariantID,
				prev.QuantityOrdered,
				"so",
				so.OrderNumber,
				so.CreatedBy,
				so.CreatedByName,
			)
		}
		return nil, err
	}

	now := time.Now()
	so.Status = models.SOStatusConfirmed
	so.ConfirmedAt = &now
	return so, nil
}

func (s *soService) StartPicking(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error) {
	so, err := s.soRepo.FindSOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if so.Status != models.SOStatusConfirmed {
		return nil, fmt.Errorf("cannot start picking: order is %s (must be confirmed)", so.Status)
	}

	if err := s.soRepo.UpdateSOStatus(ctx, id, models.SOStatusPicking); err != nil {
		return nil, err
	}
	so.Status = models.SOStatusPicking
	return so, nil
}

func (s *soService) StartPacking(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error) {
	so, err := s.soRepo.FindSOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if so.Status != models.SOStatusPicking && so.Status != models.SOStatusConfirmed {
		return nil, fmt.Errorf("cannot pack order in status %s (must be confirmed or picking)", so.Status)
	}

	if err := s.soRepo.UpdateSOStatus(ctx, id, models.SOStatusPacking); err != nil {
		return nil, err
	}
	so.Status = models.SOStatusPacking
	return so, nil
}

// DispatchSO: Deducts reserved stock and records courier dispatch
func (s *soService) DispatchSO(ctx context.Context, id primitive.ObjectID, req models.DispatchSORequest, userID, userName string) (*models.SalesOrder, error) {
	so, err := s.soRepo.FindSOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if so.Status != models.SOStatusPacking && so.Status != models.SOStatusPicking && so.Status != models.SOStatusConfirmed {
		return nil, fmt.Errorf("cannot dispatch order in status %s (must be confirmed, picking, or packing)", so.Status)
	}

	if req.Carrier == "" {
		return nil, errors.New("carrier name is required for shipment dispatch")
	}
	if req.TrackingNumber == "" {
		return nil, errors.New("tracking number is required for shipment dispatch")
	}

	// Deduct reserved stock from physical inventory
	for _, item := range so.Items {
		notes := fmt.Sprintf("Dispatched SO %s via %s (#%s)", so.OrderNumber, req.Carrier, req.TrackingNumber)
		if req.Notes != "" {
			notes += " - " + req.Notes
		}

		_, err := s.inventoryService.DeductReservedStock(
			ctx,
			so.WarehouseID,
			item.LocationID,
			item.ProductID,
			item.VariantID,
			item.QuantityOrdered,
			"so",
			so.OrderNumber,
			notes,
			userID,
			userName,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to deduct reserved inventory for item %s: %w", item.ProductName, err)
		}
	}

	now := time.Now()
	if err := s.soRepo.UpdateSODispatch(ctx, id, req.Carrier, req.TrackingNumber, now, models.SOStatusShipped); err != nil {
		return nil, err
	}

	so.Status = models.SOStatusShipped
	so.Carrier = req.Carrier
	so.TrackingNumber = req.TrackingNumber
	so.ShippedAt = &now
	return so, nil
}

func (s *soService) DeliverSO(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error) {
	so, err := s.soRepo.FindSOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if so.Status != models.SOStatusShipped {
		return nil, fmt.Errorf("cannot mark delivered: order is %s (must be shipped)", so.Status)
	}

	now := time.Now()
	if err := s.soRepo.UpdateSODelivered(ctx, id, now); err != nil {
		return nil, err
	}

	so.Status = models.SOStatusDelivered
	so.DeliveredAt = &now
	return so, nil
}

// CancelSO: Automatically releases reserved stock if order was confirmed/picking/packing
func (s *soService) CancelSO(ctx context.Context, id primitive.ObjectID, userID, userName string) (*models.SalesOrder, error) {
	so, err := s.soRepo.FindSOByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if so.Status == models.SOStatusShipped || so.Status == models.SOStatusDelivered {
		return nil, errors.New("cannot cancel order: shipment has already been dispatched or delivered")
	}
	if so.Status == models.SOStatusCancelled {
		return so, nil
	}

	// Release reservations if held
	if so.Status == models.SOStatusConfirmed || so.Status == models.SOStatusPicking || so.Status == models.SOStatusPacking {
		for _, item := range so.Items {
			_, _ = s.inventoryService.ReleaseStock(
				ctx,
				so.WarehouseID,
				item.LocationID,
				item.ProductID,
				item.VariantID,
				item.QuantityOrdered,
				"so",
				so.OrderNumber,
				userID,
				userName,
			)
		}
	}

	if err := s.soRepo.UpdateSOStatus(ctx, id, models.SOStatusCancelled); err != nil {
		return nil, err
	}

	so.Status = models.SOStatusCancelled
	return so, nil
}

func (s *soService) DeleteSO(ctx context.Context, id primitive.ObjectID) error {
	return s.soRepo.DeleteSO(ctx, id)
}

func (s *soService) GetSOStats(ctx context.Context) (*models.SOStatsResponse, error) {
	return s.soRepo.GetSOStats(ctx)
}

// SeedInitialCustomersAndSOs provides default vendor accounts and sample sales orders
func (s *soService) SeedInitialCustomersAndSOs(ctx context.Context) error {
	count, err := s.soRepo.CountCustomers(ctx)
	if err == nil && count > 0 {
		return nil
	}

	customers := []models.Customer{
		{
			Code:      "CUST-001",
			Name:      "PT Retail Megantara Abadi",
			Email:     "procurement@megantara.co.id",
			Phone:     "021-555-1234",
			Address:   "Kawasan Industri Pulogadung Blok B-12",
			City:      "Jakarta Timur",
			IsActive:  true,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
		{
			Code:      "CUST-002",
			Name:      "CV Sentosa Distributor Utama",
			Email:     "sales@sentosautama.com",
			Phone:     "031-777-8899",
			Address:   "Jl. Margomulyo Indah No. 45",
			City:      "Surabaya",
			IsActive:  true,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
		{
			Code:      "CUST-003",
			Name:      "PT Toko Bersama Sejahtera",
			Email:     "buyer@tokobersama.id",
			Phone:     "022-888-4433",
			Address:   "Jl. Soekarno Hatta No. 89",
			City:      "Bandung",
			IsActive:  true,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}

	for _, c := range customers {
		_ = s.soRepo.CreateCustomer(ctx, &c)
	}

	return nil
}
