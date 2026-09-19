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

type POService interface {
	// Supplier CRUD
	CreateSupplier(ctx context.Context, req models.CreateSupplierRequest) (*models.Supplier, error)
	GetSupplierByID(ctx context.Context, id primitive.ObjectID) (*models.Supplier, error)
	ListSuppliers(ctx context.Context) ([]models.Supplier, error)
	UpdateSupplier(ctx context.Context, id primitive.ObjectID, req models.UpdateSupplierRequest) (*models.Supplier, error)
	DeleteSupplier(ctx context.Context, id primitive.ObjectID) error

	// Purchase Order lifecycle
	CreatePO(ctx context.Context, req models.CreatePORequest, userID, userName string) (*models.PurchaseOrder, error)
	GetPOByID(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error)
	ListPOs(ctx context.Context, params models.POQueryParam) ([]models.PurchaseOrder, int64, error)
	UpdatePO(ctx context.Context, id primitive.ObjectID, req models.UpdatePORequest) (*models.PurchaseOrder, error)
	MarkOrdered(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error)
	CancelPO(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error)
	DeletePO(ctx context.Context, id primitive.ObjectID) error
	ReceivePO(ctx context.Context, id primitive.ObjectID, req models.ReceivePORequest, userID, userName string) (*models.PurchaseOrder, error)
	GetPOStats(ctx context.Context) (*models.POStatsResponse, error)

	SeedInitialSuppliersAndPOs(ctx context.Context) error
}

type poService struct {
	poRepo           repository.PORepository
	productRepo      repository.ProductRepository
	warehouseRepo    repository.WarehouseRepository
	inventoryService InventoryService
}

func NewPOService(
	poRepo repository.PORepository,
	productRepo repository.ProductRepository,
	warehouseRepo repository.WarehouseRepository,
	inventoryService InventoryService,
) POService {
	return &poService{
		poRepo:           poRepo,
		productRepo:      productRepo,
		warehouseRepo:    warehouseRepo,
		inventoryService: inventoryService,
	}
}

// Supplier implementation
func (s *poService) CreateSupplier(ctx context.Context, req models.CreateSupplierRequest) (*models.Supplier, error) {
	code := req.Code
	if code == "" {
		code = fmt.Sprintf("SUP-%d", 100+rand.Intn(900))
	}

	supplier := &models.Supplier{
		Code:          code,
		Name:          req.Name,
		Email:         req.Email,
		Phone:         req.Phone,
		Address:       req.Address,
		ContactPerson: req.ContactPerson,
		IsActive:      true,
	}

	if err := s.poRepo.CreateSupplier(ctx, supplier); err != nil {
		return nil, err
	}
	return supplier, nil
}

func (s *poService) GetSupplierByID(ctx context.Context, id primitive.ObjectID) (*models.Supplier, error) {
	return s.poRepo.FindSupplierByID(ctx, id)
}

func (s *poService) ListSuppliers(ctx context.Context) ([]models.Supplier, error) {
	return s.poRepo.ListSuppliers(ctx)
}

func (s *poService) UpdateSupplier(ctx context.Context, id primitive.ObjectID, req models.UpdateSupplierRequest) (*models.Supplier, error) {
	supplier, err := s.poRepo.FindSupplierByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Code != "" {
		supplier.Code = req.Code
	}
	supplier.Name = req.Name
	supplier.Email = req.Email
	supplier.Phone = req.Phone
	supplier.Address = req.Address
	supplier.ContactPerson = req.ContactPerson
	supplier.IsActive = req.IsActive

	if err := s.poRepo.UpdateSupplier(ctx, id, supplier); err != nil {
		return nil, err
	}
	return supplier, nil
}

func (s *poService) DeleteSupplier(ctx context.Context, id primitive.ObjectID) error {
	return s.poRepo.DeleteSupplier(ctx, id)
}

// Purchase Order implementation
func (s *poService) CreatePO(ctx context.Context, req models.CreatePORequest, userID, userName string) (*models.PurchaseOrder, error) {
	if len(req.Items) == 0 {
		return nil, errors.New("purchase order must contain at least one item")
	}

	supplierID, err := primitive.ObjectIDFromHex(req.SupplierID)
	if err != nil {
		return nil, errors.New("invalid supplier id")
	}
	supplier, err := s.poRepo.FindSupplierByID(ctx, supplierID)
	if err != nil {
		return nil, fmt.Errorf("supplier not found: %w", err)
	}

	warehouseID, err := primitive.ObjectIDFromHex(req.WarehouseID)
	if err != nil {
		return nil, errors.New("invalid warehouse id")
	}
	warehouse, err := s.warehouseRepo.FindWarehouseByID(ctx, warehouseID)
	if err != nil {
		return nil, fmt.Errorf("warehouse not found: %w", err)
	}

	var poItems []models.POItem
	totalQty := 0
	var totalAmount float64

	for _, itemReq := range req.Items {
		prodID, err := primitive.ObjectIDFromHex(itemReq.ProductID)
		if err != nil {
			return nil, fmt.Errorf("invalid product id: %s", itemReq.ProductID)
		}
		product, err := s.productRepo.FindProductByID(ctx, prodID)
		if err != nil {
			return nil, fmt.Errorf("product not found: %w", err)
		}

		sku := product.SKU
		prodName := product.Name
		unitCost := itemReq.UnitCost
		if unitCost <= 0 {
			unitCost = product.CostPrice
		}

		if itemReq.VariantID != "" {
			for _, v := range product.Variants {
				if v.ID == itemReq.VariantID {
					if v.SKU != "" {
						sku = v.SKU
					}
					prodName = fmt.Sprintf("%s (%s)", product.Name, v.Name)
					if itemReq.UnitCost <= 0 && v.CostPrice > 0 {
						unitCost = v.CostPrice
					}
					break
				}
			}
		}

		subtotal := float64(itemReq.QuantityOrdered) * unitCost
		totalQty += itemReq.QuantityOrdered
		totalAmount += subtotal

		var targetLocID *primitive.ObjectID
		if itemReq.TargetLocationID != "" {
			if locID, err := primitive.ObjectIDFromHex(itemReq.TargetLocationID); err == nil {
				targetLocID = &locID
			}
		}

		poItems = append(poItems, models.POItem{
			ProductID:        prodID,
			VariantID:        itemReq.VariantID,
			ProductName:      prodName,
			SKU:              sku,
			Unit:             product.Unit,
			QuantityOrdered:  itemReq.QuantityOrdered,
			QuantityReceived: 0,
			UnitCost:         unitCost,
			Subtotal:         subtotal,
			TargetLocationID: targetLocID,
		})
	}

	orderNumber := fmt.Sprintf("PO-%s-%04d", time.Now().Format("20060102"), 1000+rand.Intn(9000))

	po := &models.PurchaseOrder{
		OrderNumber:           orderNumber,
		SupplierID:            supplierID,
		SupplierName:          supplier.Name,
		WarehouseID:           warehouseID,
		WarehouseName:         warehouse.Name,
		Status:                models.POStatusDraft,
		Items:                 poItems,
		TotalQuantityOrdered:  totalQty,
		TotalQuantityReceived: 0,
		TotalAmount:           totalAmount,
		ExpectedDate:          req.ExpectedDate,
		Notes:                 req.Notes,
		CreatedBy:             userID,
		CreatedByName:         userName,
	}

	if err := s.poRepo.CreatePO(ctx, po); err != nil {
		return nil, err
	}
	return po, nil
}

func (s *poService) GetPOByID(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error) {
	return s.poRepo.FindPOByID(ctx, id)
}

func (s *poService) ListPOs(ctx context.Context, params models.POQueryParam) ([]models.PurchaseOrder, int64, error) {
	return s.poRepo.ListPOs(ctx, params)
}

func (s *poService) UpdatePO(ctx context.Context, id primitive.ObjectID, req models.UpdatePORequest) (*models.PurchaseOrder, error) {
	existing, err := s.poRepo.FindPOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing.Status != models.POStatusDraft {
		return nil, repository.ErrPOAlreadyLocked
	}

	supplierID, err := primitive.ObjectIDFromHex(req.SupplierID)
	if err != nil {
		return nil, errors.New("invalid supplier id")
	}
	supplier, err := s.poRepo.FindSupplierByID(ctx, supplierID)
	if err != nil {
		return nil, fmt.Errorf("supplier not found: %w", err)
	}

	warehouseID, err := primitive.ObjectIDFromHex(req.WarehouseID)
	if err != nil {
		return nil, errors.New("invalid warehouse id")
	}
	warehouse, err := s.warehouseRepo.FindWarehouseByID(ctx, warehouseID)
	if err != nil {
		return nil, fmt.Errorf("warehouse not found: %w", err)
	}

	var poItems []models.POItem
	totalQty := 0
	var totalAmount float64

	for _, itemReq := range req.Items {
		prodID, err := primitive.ObjectIDFromHex(itemReq.ProductID)
		if err != nil {
			return nil, fmt.Errorf("invalid product id: %s", itemReq.ProductID)
		}
		product, err := s.productRepo.FindProductByID(ctx, prodID)
		if err != nil {
			return nil, fmt.Errorf("product not found: %w", err)
		}

		sku := product.SKU
		prodName := product.Name
		unitCost := itemReq.UnitCost
		if unitCost <= 0 {
			unitCost = product.CostPrice
		}

		if itemReq.VariantID != "" {
			for _, v := range product.Variants {
				if v.ID == itemReq.VariantID {
					if v.SKU != "" {
						sku = v.SKU
					}
					prodName = fmt.Sprintf("%s (%s)", product.Name, v.Name)
					if itemReq.UnitCost <= 0 && v.CostPrice > 0 {
						unitCost = v.CostPrice
					}
					break
				}
			}
		}

		subtotal := float64(itemReq.QuantityOrdered) * unitCost
		totalQty += itemReq.QuantityOrdered
		totalAmount += subtotal

		var targetLocID *primitive.ObjectID
		if itemReq.TargetLocationID != "" {
			if locID, err := primitive.ObjectIDFromHex(itemReq.TargetLocationID); err == nil {
				targetLocID = &locID
			}
		}

		poItems = append(poItems, models.POItem{
			ProductID:        prodID,
			VariantID:        itemReq.VariantID,
			ProductName:      prodName,
			SKU:              sku,
			Unit:             product.Unit,
			QuantityOrdered:  itemReq.QuantityOrdered,
			QuantityReceived: 0,
			UnitCost:         unitCost,
			Subtotal:         subtotal,
			TargetLocationID: targetLocID,
		})
	}

	existing.SupplierID = supplierID
	existing.SupplierName = supplier.Name
	existing.WarehouseID = warehouseID
	existing.WarehouseName = warehouse.Name
	existing.Items = poItems
	existing.TotalQuantityOrdered = totalQty
	existing.TotalAmount = totalAmount
	existing.ExpectedDate = req.ExpectedDate
	existing.Notes = req.Notes

	if err := s.poRepo.UpdatePO(ctx, id, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *poService) MarkOrdered(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error) {
	po, err := s.poRepo.FindPOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if po.Status != models.POStatusDraft {
		return nil, fmt.Errorf("cannot mark as ordered: order is currently in '%s' status", po.Status)
	}

	if err := s.poRepo.UpdatePOStatus(ctx, id, models.POStatusOrdered); err != nil {
		return nil, err
	}
	po.Status = models.POStatusOrdered
	return po, nil
}

func (s *poService) CancelPO(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error) {
	po, err := s.poRepo.FindPOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if po.Status == models.POStatusReceived {
		return nil, errors.New("cannot cancel a fully received purchase order")
	}
	if po.Status == models.POStatusCancelled {
		return nil, errors.New("purchase order is already cancelled")
	}

	if err := s.poRepo.UpdatePOStatus(ctx, id, models.POStatusCancelled); err != nil {
		return nil, err
	}
	po.Status = models.POStatusCancelled
	return po, nil
}

func (s *poService) DeletePO(ctx context.Context, id primitive.ObjectID) error {
	return s.poRepo.DeletePO(ctx, id)
}

func (s *poService) ReceivePO(ctx context.Context, id primitive.ObjectID, req models.ReceivePORequest, userID, userName string) (*models.PurchaseOrder, error) {
	po, err := s.poRepo.FindPOByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if po.Status != models.POStatusOrdered && po.Status != models.POStatusPartiallyReceived {
		return nil, fmt.Errorf("cannot receive items for purchase order in '%s' status (must be ordered or partially_received)", po.Status)
	}
	if len(req.Items) == 0 {
		return nil, errors.New("no items specified for receipt")
	}

	// Process each received item
	for _, recv := range req.Items {
		if recv.QuantityReceived <= 0 {
			continue
		}

		prodID, err := primitive.ObjectIDFromHex(recv.ProductID)
		if err != nil {
			return nil, fmt.Errorf("invalid product id: %s", recv.ProductID)
		}

		locID, err := primitive.ObjectIDFromHex(recv.LocationID)
		if err != nil {
			return nil, fmt.Errorf("invalid location id: %s", recv.LocationID)
		}

		// Find item in PO
		itemIndex := -1
		for i, item := range po.Items {
			if item.ProductID == prodID && item.VariantID == recv.VariantID {
				itemIndex = i
				break
			}
		}

		if itemIndex == -1 {
			return nil, fmt.Errorf("product %s is not part of this purchase order", recv.ProductID)
		}

		item := &po.Items[itemIndex]
		remaining := item.QuantityOrdered - item.QuantityReceived
		if recv.QuantityReceived > remaining {
			return nil, fmt.Errorf("cannot receive %d units for '%s'; only %d remaining to receive", recv.QuantityReceived, item.ProductName, remaining)
		}

		// Execute Stock In into destination bin location using transaction-safe InventoryService!
		stockInReq := models.StockInRequest{
			ProductID:     recv.ProductID,
			VariantID:     recv.VariantID,
			WarehouseID:   po.WarehouseID.Hex(),
			LocationID:    recv.LocationID,
			Quantity:      recv.QuantityReceived,
			ReferenceType: "po",
			ReferenceID:   po.OrderNumber,
			Notes:         fmt.Sprintf("Inbound receipt from %s (%s)", po.SupplierName, req.Notes),
		}

		_, err = s.inventoryService.StockIn(ctx, stockInReq, userID, userName)
		if err != nil {
			return nil, fmt.Errorf("failed to stock in item '%s': %w", item.ProductName, err)
		}

		item.QuantityReceived += recv.QuantityReceived
		item.TargetLocationID = &locID
	}

	// Calculate overall receiving progress
	totalReceived := 0
	allFulfilled := true
	for _, item := range po.Items {
		totalReceived += item.QuantityReceived
		if item.QuantityReceived < item.QuantityOrdered {
			allFulfilled = false
		}
	}

	newStatus := models.POStatusPartiallyReceived
	if allFulfilled {
		newStatus = models.POStatusReceived
	}

	if err := s.poRepo.UpdatePOReceivedItems(ctx, id, po.Items, totalReceived, newStatus); err != nil {
		return nil, err
	}

	po.TotalQuantityReceived = totalReceived
	po.Status = newStatus
	return po, nil
}

func (s *poService) GetPOStats(ctx context.Context) (*models.POStatsResponse, error) {
	return s.poRepo.GetPOStats(ctx)
}

func (s *poService) SeedInitialSuppliersAndPOs(ctx context.Context) error {
	stats, err := s.poRepo.GetPOStats(ctx)
	if err == nil && stats.TotalOrders > 0 {
		return nil // already seeded
	}

	// 1. Seed sample suppliers
	supCount, _ := s.poRepo.CountSuppliers(ctx)
	var sup1, sup2 *models.Supplier
	if supCount == 0 {
		sup1, _ = s.CreateSupplier(ctx, models.CreateSupplierRequest{
			Code:          "SUP-NUSA-01",
			Name:          "PT Teknologi Nusantara",
			Email:         "sales@teknusantara.co.id",
			Phone:         "+62 21 555-0199",
			Address:       "Kawasan Industri Pulogadung Blok B4, Jakarta Timur",
			ContactPerson: "Budi Pratama",
		})

		sup2, _ = s.CreateSupplier(ctx, models.CreateSupplierRequest{
			Code:          "SUP-TEKS-02",
			Name:          "CV Mitra Tekstil Sentosa",
			Email:         "orders@mitratekstil.com",
			Phone:         "+62 22 730-8821",
			Address:       "Jl. Raya Rancaekek KM 23, Bandung",
			ContactPerson: "Dewi Lestari",
		})

		_, _ = s.CreateSupplier(ctx, models.CreateSupplierRequest{
			Code:          "SUP-LOGI-03",
			Name:          "PT Sarana Industri Mandiri",
			Email:         "procurement@saranaindustri.id",
			Phone:         "+62 31 849-5500",
			Address:       "Rungkut Megah Raya Blok D-12, Surabaya",
			ContactPerson: "Hendro Wijaya",
		})
	} else {
		suppliers, _ := s.poRepo.ListSuppliers(ctx)
		if len(suppliers) > 0 {
			sup1 = &suppliers[0]
		}
		if len(suppliers) > 1 {
			sup2 = &suppliers[1]
		}
	}

	if sup1 == nil {
		return nil
	}

	// 2. Fetch warehouses & products
	warehouses, err := s.warehouseRepo.FindWarehouses(ctx)
	if err != nil || len(warehouses) == 0 {
		return nil
	}
	wh := warehouses[0]

	products, _, err := s.productRepo.FindProducts(ctx, models.ProductQueryParam{Limit: 10})
	if err != nil || len(products) == 0 {
		return nil
	}

	// 3. Seed an active PO in "ordered" state
	expectedTomorrow := time.Now().Add(24 * time.Hour)
	_, _ = s.CreatePO(ctx, models.CreatePORequest{
		SupplierID:   sup1.ID.Hex(),
		WarehouseID:  wh.ID.Hex(),
		ExpectedDate: &expectedTomorrow,
		Notes:        "Urgent replenishment for Q3 catalog peak",
		Items: []models.CreatePOItemRequest{
			{
				ProductID:       products[0].ID.Hex(),
				QuantityOrdered: 30,
				UnitCost:        products[0].CostPrice,
			},
		},
	}, "system", "System Seeder")

	// Transition this first PO to 'ordered'
	orders, _, _ := s.poRepo.ListPOs(ctx, models.POQueryParam{Limit: 1})
	if len(orders) > 0 {
		_ = s.poRepo.UpdatePOStatus(ctx, orders[0].ID, models.POStatusOrdered)
	}

	// 4. Seed a completed PO in "received" state if more products available
	if len(products) > 1 && sup2 != nil {
		po2, err := s.CreatePO(ctx, models.CreatePORequest{
			SupplierID:  sup2.ID.Hex(),
			WarehouseID: wh.ID.Hex(),
			Notes:       "Standard monthly procurement",
			Items: []models.CreatePOItemRequest{
				{
					ProductID:       products[1].ID.Hex(),
					QuantityOrdered: 50,
					UnitCost:        products[1].CostPrice,
				},
			},
		}, "system", "System Seeder")
		if err == nil {
			_ = s.poRepo.UpdatePOStatus(ctx, po2.ID, models.POStatusReceived)
			po2.Items[0].QuantityReceived = 50
			_ = s.poRepo.UpdatePOReceivedItems(ctx, po2.ID, po2.Items, 50, models.POStatusReceived)
		}
	}

	return nil
}
