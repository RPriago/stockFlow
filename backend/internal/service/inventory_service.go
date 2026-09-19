package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrInvalidRequest = errors.New("invalid inventory request")
)

type InventoryService interface {
	StockIn(ctx context.Context, req models.StockInRequest, userID, userName string) (*models.InventoryItem, error)
	StockOut(ctx context.Context, req models.StockOutRequest, userID, userName string) (*models.InventoryItem, error)
	AdjustStock(ctx context.Context, req models.StockAdjustmentRequest, userID, userName string) (*models.InventoryItem, error)
	ReserveStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int, refType, refID, userID, userName string) (*models.InventoryItem, error)
	ReleaseStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int, refType, refID, userID, userName string) (*models.InventoryItem, error)
	DeductReservedStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int, refType, refID, notes, userID, userName string) (*models.InventoryItem, error)

	GetInventory(ctx context.Context, params models.InventoryQueryParam) ([]models.InventoryItem, int64, error)
	GetMovements(ctx context.Context, params models.MovementQueryParam) ([]models.InventoryMovement, int64, error)
	GetStats(ctx context.Context) (*models.InventoryStatsResponse, error)
	GetStockFlowAnalytics(ctx context.Context, period, rangeParam string, tzOffset int) (*models.StockFlowResponse, error)
	GetWarehouseCapacityAnalytics(ctx context.Context) (*models.WarehouseCapacityResponse, error)
	SeedInitialStock(ctx context.Context) error
}

type inventoryService struct {
	inventoryRepo repository.InventoryRepository
	productRepo   repository.ProductRepository
	warehouseRepo repository.WarehouseRepository
}

func NewInventoryService(
	inventoryRepo repository.InventoryRepository,
	productRepo repository.ProductRepository,
	warehouseRepo repository.WarehouseRepository,
) InventoryService {
	return &inventoryService{
		inventoryRepo: inventoryRepo,
		productRepo:   productRepo,
		warehouseRepo: warehouseRepo,
	}
}

func (s *inventoryService) StockIn(ctx context.Context, req models.StockInRequest, userID, userName string) (*models.InventoryItem, error) {
	if req.Quantity <= 0 {
		return nil, repository.ErrInvalidStockAmount
	}

	prodID, err := primitive.ObjectIDFromHex(req.ProductID)
	if err != nil {
		return nil, errors.New("invalid product id")
	}

	whID, err := primitive.ObjectIDFromHex(req.WarehouseID)
	if err != nil {
		return nil, errors.New("invalid warehouse id")
	}

	locID, err := primitive.ObjectIDFromHex(req.LocationID)
	if err != nil {
		return nil, errors.New("invalid location id")
	}

	product, err := s.productRepo.FindProductByID(ctx, prodID)
	if err != nil {
		return nil, fmt.Errorf("product lookup failed: %w", err)
	}

	wh, err := s.warehouseRepo.FindWarehouseByID(ctx, whID)
	if err != nil {
		return nil, fmt.Errorf("warehouse lookup failed: %w", err)
	}

	loc, err := s.warehouseRepo.FindLocationByID(ctx, locID)
	if err != nil {
		return nil, fmt.Errorf("location lookup failed: %w", err)
	}
	if loc.WarehouseID != whID {
		return nil, errors.New("location does not belong to specified warehouse")
	}

	// Validate Bin Max Capacity
	if loc.MaxCapacity > 0 {
		existingItems, _, err := s.inventoryRepo.FindItems(ctx, models.InventoryQueryParam{LocationID: locID.Hex()})
		if err == nil {
			currentOccupancy := 0
			for _, it := range existingItems {
				currentOccupancy += it.QuantityOnHand
			}
			if currentOccupancy+req.Quantity > loc.MaxCapacity {
				avail := loc.MaxCapacity - currentOccupancy
				if avail < 0 {
					avail = 0
				}
				return nil, fmt.Errorf("melebihi kapasitas rak: Rak %s memiliki kapasitas maks %d pcs (saat ini terisi %d pcs, sisa kapasitas %d pcs, mencoba memasukkan %d pcs)", loc.Code, loc.MaxCapacity, currentOccupancy, avail, req.Quantity)
			}
		}
	}

	// Determine SKU and product name variant if applicable
	sku := product.SKU
	productName := product.Name
	minStock := product.MinStock
	if req.VariantID != "" {
		for _, v := range product.Variants {
			if v.ID == req.VariantID {
				if v.SKU != "" {
					sku = v.SKU
				}
				productName = fmt.Sprintf("%s (%s)", product.Name, v.Name)
				if v.MinStock > 0 {
					minStock = v.MinStock
				}
				break
			}
		}
	}

	refType := req.ReferenceType
	if refType == "" {
		refType = "manual"
	}

	itemModel := &models.InventoryItem{
		ProductID:     prodID,
		VariantID:     req.VariantID,
		WarehouseID:   whID,
		LocationID:    locID,
		ProductName:   productName,
		SKU:           sku,
		WarehouseName: wh.Name,
		LocationCode:  loc.Code,
		MinStock:      minStock,
		Unit:          product.Unit,
	}

	updated, balanceBefore, err := s.inventoryRepo.StockIn(ctx, itemModel, req.Quantity)
	if err != nil {
		return nil, err
	}

	// Ledger recording
	movement := &models.InventoryMovement{
		ItemID:        updated.ID,
		ProductID:     prodID,
		VariantID:     req.VariantID,
		WarehouseID:   whID,
		LocationID:    locID,
		ProductName:   productName,
		SKU:           sku,
		WarehouseName: wh.Name,
		LocationCode:  loc.Code,
		MovementType:  models.MovementTypeStockIn,
		Quantity:      req.Quantity,
		BalanceBefore: balanceBefore,
		BalanceAfter:  updated.QuantityOnHand,
		ReferenceType: refType,
		ReferenceID:   req.ReferenceID,
		Notes:         req.Notes,
		CreatedBy:     userID,
		CreatedByName: userName,
		CreatedAt:     time.Now(),
	}
	_ = s.inventoryRepo.RecordMovement(ctx, movement)

	return updated, nil
}

func (s *inventoryService) StockOut(ctx context.Context, req models.StockOutRequest, userID, userName string) (*models.InventoryItem, error) {
	if req.Quantity <= 0 {
		return nil, repository.ErrInvalidStockAmount
	}

	prodID, err := primitive.ObjectIDFromHex(req.ProductID)
	if err != nil {
		return nil, errors.New("invalid product id")
	}

	whID, err := primitive.ObjectIDFromHex(req.WarehouseID)
	if err != nil {
		return nil, errors.New("invalid warehouse id")
	}

	locID, err := primitive.ObjectIDFromHex(req.LocationID)
	if err != nil {
		return nil, errors.New("invalid location id")
	}

	updated, balanceBefore, err := s.inventoryRepo.StockOut(ctx, whID, locID, prodID, req.VariantID, req.Quantity)
	if err != nil {
		return nil, err
	}

	refType := req.ReferenceType
	if refType == "" {
		refType = "manual"
	}

	// Ledger recording
	movement := &models.InventoryMovement{
		ItemID:        updated.ID,
		ProductID:     prodID,
		VariantID:     req.VariantID,
		WarehouseID:   whID,
		LocationID:    locID,
		ProductName:   updated.ProductName,
		SKU:           updated.SKU,
		WarehouseName: updated.WarehouseName,
		LocationCode:  updated.LocationCode,
		MovementType:  models.MovementTypeStockOut,
		Quantity:      -req.Quantity,
		BalanceBefore: balanceBefore,
		BalanceAfter:  updated.QuantityOnHand,
		ReferenceType: refType,
		ReferenceID:   req.ReferenceID,
		Notes:         req.Notes,
		CreatedBy:     userID,
		CreatedByName: userName,
		CreatedAt:     time.Now(),
	}
	_ = s.inventoryRepo.RecordMovement(ctx, movement)

	return updated, nil
}

func (s *inventoryService) AdjustStock(ctx context.Context, req models.StockAdjustmentRequest, userID, userName string) (*models.InventoryItem, error) {
	if req.ActualQuantity < 0 {
		return nil, repository.ErrInvalidStockAmount
	}

	prodID, err := primitive.ObjectIDFromHex(req.ProductID)
	if err != nil {
		return nil, errors.New("invalid product id")
	}

	whID, err := primitive.ObjectIDFromHex(req.WarehouseID)
	if err != nil {
		return nil, errors.New("invalid warehouse id")
	}

	locID, err := primitive.ObjectIDFromHex(req.LocationID)
	if err != nil {
		return nil, errors.New("invalid location id")
	}

	loc, err := s.warehouseRepo.FindLocationByID(ctx, locID)
	if err != nil {
		return nil, fmt.Errorf("location lookup failed: %w", err)
	}
	if loc.WarehouseID != whID {
		return nil, errors.New("location does not belong to specified warehouse")
	}

	// Validate Bin Max Capacity for stock adjustment
	if loc.MaxCapacity > 0 {
		existingItems, _, err := s.inventoryRepo.FindItems(ctx, models.InventoryQueryParam{LocationID: locID.Hex()})
		if err == nil {
			otherOccupancy := 0
			for _, it := range existingItems {
				if it.ProductID == prodID && it.VariantID == req.VariantID {
					continue
				}
				otherOccupancy += it.QuantityOnHand
			}
			if otherOccupancy+req.ActualQuantity > loc.MaxCapacity {
				return nil, fmt.Errorf("melebihi kapasitas rak: Rak %s memiliki kapasitas maks %d pcs (hasil penyesuaian akan menjadi %d pcs)", loc.Code, loc.MaxCapacity, otherOccupancy+req.ActualQuantity)
			}
		}
	}

	updated, balanceBefore, err := s.inventoryRepo.AdjustStock(ctx, whID, locID, prodID, req.VariantID, req.ActualQuantity)
	if err != nil {
		return nil, err
	}

	delta := updated.QuantityOnHand - balanceBefore

	// Ledger recording
	movement := &models.InventoryMovement{
		ItemID:        updated.ID,
		ProductID:     prodID,
		VariantID:     req.VariantID,
		WarehouseID:   whID,
		LocationID:    locID,
		ProductName:   updated.ProductName,
		SKU:           updated.SKU,
		WarehouseName: updated.WarehouseName,
		LocationCode:  updated.LocationCode,
		MovementType:  models.MovementTypeAdjustment,
		Quantity:      delta,
		BalanceBefore: balanceBefore,
		BalanceAfter:  updated.QuantityOnHand,
		ReferenceType: "audit",
		ReferenceID:   req.Reason,
		Notes:         req.Notes,
		CreatedBy:     userID,
		CreatedByName: userName,
		CreatedAt:     time.Now(),
	}
	_ = s.inventoryRepo.RecordMovement(ctx, movement)

	return updated, nil
}

func (s *inventoryService) ReserveStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int, refType, refID, userID, userName string) (*models.InventoryItem, error) {
	updated, err := s.inventoryRepo.ReserveStock(ctx, warehouseID, locationID, productID, variantID, qty)
	if err != nil {
		return nil, err
	}

	movement := &models.InventoryMovement{
		ItemID:        updated.ID,
		ProductID:     productID,
		VariantID:     variantID,
		WarehouseID:   warehouseID,
		LocationID:    locationID,
		ProductName:   updated.ProductName,
		SKU:           updated.SKU,
		WarehouseName: updated.WarehouseName,
		LocationCode:  updated.LocationCode,
		MovementType:  models.MovementTypeReserve,
		Quantity:      qty,
		BalanceBefore: updated.QuantityOnHand,
		BalanceAfter:  updated.QuantityOnHand,
		ReferenceType: refType,
		ReferenceID:   refID,
		Notes:         fmt.Sprintf("Reserved %d %s", qty, updated.Unit),
		CreatedBy:     userID,
		CreatedByName: userName,
		CreatedAt:     time.Now(),
	}
	_ = s.inventoryRepo.RecordMovement(ctx, movement)

	return updated, nil
}

func (s *inventoryService) ReleaseStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int, refType, refID, userID, userName string) (*models.InventoryItem, error) {
	updated, err := s.inventoryRepo.ReleaseStock(ctx, warehouseID, locationID, productID, variantID, qty)
	if err != nil {
		return nil, err
	}

	movement := &models.InventoryMovement{
		ItemID:        updated.ID,
		ProductID:     productID,
		VariantID:     variantID,
		WarehouseID:   warehouseID,
		LocationID:    locationID,
		ProductName:   updated.ProductName,
		SKU:           updated.SKU,
		WarehouseName: updated.WarehouseName,
		LocationCode:  updated.LocationCode,
		MovementType:  models.MovementTypeRelease,
		Quantity:      -qty,
		BalanceBefore: updated.QuantityOnHand,
		BalanceAfter:  updated.QuantityOnHand,
		ReferenceType: refType,
		ReferenceID:   refID,
		Notes:         fmt.Sprintf("Released %d %s", qty, updated.Unit),
		CreatedBy:     userID,
		CreatedByName: userName,
		CreatedAt:     time.Now(),
	}
	_ = s.inventoryRepo.RecordMovement(ctx, movement)

	return updated, nil
}

func (s *inventoryService) DeductReservedStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int, refType, refID, notes, userID, userName string) (*models.InventoryItem, error) {
	updated, balanceBefore, err := s.inventoryRepo.DeductReservedStock(ctx, warehouseID, locationID, productID, variantID, qty)
	if err != nil {
		return nil, err
	}

	movement := &models.InventoryMovement{
		ItemID:        updated.ID,
		ProductID:     productID,
		VariantID:     variantID,
		WarehouseID:   warehouseID,
		LocationID:    locationID,
		ProductName:   updated.ProductName,
		SKU:           updated.SKU,
		WarehouseName: updated.WarehouseName,
		LocationCode:  updated.LocationCode,
		MovementType:  models.MovementTypeStockOut,
		Quantity:      -qty,
		BalanceBefore: balanceBefore,
		BalanceAfter:  updated.QuantityOnHand,
		ReferenceType: refType,
		ReferenceID:   refID,
		Notes:         notes,
		CreatedBy:     userID,
		CreatedByName: userName,
		CreatedAt:     time.Now(),
	}
	_ = s.inventoryRepo.RecordMovement(ctx, movement)

	return updated, nil
}

func (s *inventoryService) GetInventory(ctx context.Context, params models.InventoryQueryParam) ([]models.InventoryItem, int64, error) {
	return s.inventoryRepo.FindItems(ctx, params)
}

func (s *inventoryService) GetMovements(ctx context.Context, params models.MovementQueryParam) ([]models.InventoryMovement, int64, error) {
	return s.inventoryRepo.FindMovements(ctx, params)
}

func (s *inventoryService) GetStats(ctx context.Context) (*models.InventoryStatsResponse, error) {
	return s.inventoryRepo.GetStats(ctx)
}

func (s *inventoryService) SeedInitialStock(ctx context.Context) error {
	stats, err := s.inventoryRepo.GetStats(ctx)
	if err == nil && stats.TotalItemsCount > 0 {
		return nil // Already seeded
	}

	// Find products
	products, _, err := s.productRepo.FindProducts(ctx, models.ProductQueryParam{Limit: 20})
	if err != nil || len(products) == 0 {
		return nil
	}

	// Find warehouses
	warehouses, err := s.warehouseRepo.FindWarehouses(ctx)
	if err != nil || len(warehouses) == 0 {
		return nil
	}

	var jakartaWH, surabayaWH *models.Warehouse
	for i := range warehouses {
		if warehouses[i].City == "Jakarta" {
			jakartaWH = &warehouses[i]
		} else if warehouses[i].City == "Surabaya" {
			surabayaWH = &warehouses[i]
		}
	}
	if jakartaWH == nil {
		jakartaWH = &warehouses[0]
	}

	// Fetch locations for jakarta warehouse
	jktLocations, err := s.warehouseRepo.FindLocationsByWarehouse(ctx, jakartaWH.ID)
	if err != nil || len(jktLocations) == 0 {
		return nil
	}

	seedDistributions := []struct {
		skuMatch string
		qty      int
		locIndex int
		notes    string
	}{
		{"ELEC-LPTP-PRO", 24, 0, "Initial inventory intake PO-2026-001"},
		{"ELEC-MNTR-4K", 4, 1, "Low stock batch - alert test threshold"},
		{"FASH-HOODIE-M", 85, 2, "Fashion bulk batch received"},
		{"FOOD-COFFEE-1K", 120, 3, "Cold storage batch roasted"},
		{"IND-FORK-3T", 2, 4, "Heavy equipment staging intake"},
	}

	for _, dist := range seedDistributions {
		for _, p := range products {
			if p.SKU == dist.skuMatch {
				locIdx := dist.locIndex % len(jktLocations)
				targetLoc := jktLocations[locIdx]

				_, _ = s.StockIn(ctx, models.StockInRequest{
					ProductID:     p.ID.Hex(),
					WarehouseID:   jakartaWH.ID.Hex(),
					LocationID:    targetLoc.ID.Hex(),
					Quantity:      dist.qty,
					ReferenceType: "po",
					ReferenceID:   "PO-INIT-001",
					Notes:         dist.notes,
				}, "system", "System Seeder")
				break
			}
		}
	}

	// Also seed surabaya if available
	if surabayaWH != nil {
		sbyLocations, err := s.warehouseRepo.FindLocationsByWarehouse(ctx, surabayaWH.ID)
		if err == nil && len(sbyLocations) > 0 {
			for _, p := range products {
				if p.SKU == "ELEC-LPTP-PRO" {
					_, _ = s.StockIn(ctx, models.StockInRequest{
						ProductID:     p.ID.Hex(),
						WarehouseID:   surabayaWH.ID.Hex(),
						LocationID:    sbyLocations[0].ID.Hex(),
						Quantity:      15,
						ReferenceType: "po",
						ReferenceID:   "PO-SBY-001",
						Notes:         "East Java hub initial stock",
					}, "system", "System Seeder")
				}
			}
		}
	}

	return nil
}

func (s *inventoryService) GetStockFlowAnalytics(ctx context.Context, period, rangeParam string, tzOffset int) (*models.StockFlowResponse, error) {
	movements, _, err := s.inventoryRepo.FindMovements(ctx, models.MovementQueryParam{Limit: 1000})
	if err != nil {
		return nil, err
	}

	var points []models.StockFlowPoint
	userLoc := time.FixedZone("UserTZ", tzOffset*60)
	now := time.Now().In(userLoc)

	switch {
	case rangeParam == "today":
		// Hourly intervals for today (00:00, 04:00, 08:00, 12:00, 16:00, 20:00) with range descriptors
		timeSlots := []struct {
			label    string
			rangeStr string
		}{
			{"00:00", "00:00 - 03:59"},
			{"04:00", "04:00 - 07:59"},
			{"08:00", "08:00 - 11:59"},
			{"12:00", "12:00 - 15:59"},
			{"16:00", "16:00 - 19:59"},
			{"20:00", "20:00 - 23:59"},
		}
		points = make([]models.StockFlowPoint, len(timeSlots))
		for i, slot := range timeSlots {
			points[i] = models.StockFlowPoint{Label: slot.label, Date: slot.rangeStr}
		}

		todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, userLoc)
		for _, m := range movements {
			mTime := m.CreatedAt.In(userLoc)
			if mTime.After(todayStart) {
				hour := mTime.Hour()
				slotIdx := hour / 4
				if slotIdx >= 0 && slotIdx < len(points) {
					if m.MovementType == models.MovementTypeStockIn {
						points[slotIdx].Inbound += m.Quantity
					} else if m.MovementType == models.MovementTypeStockOut {
						qty := m.Quantity
						if qty < 0 {
							qty = -qty
						}
						points[slotIdx].Outbound += qty
					}
				}
			}
		}

	case rangeParam == "last_7d" || rangeParam == "7d" || (period == "daily" && rangeParam != "this_month" && rangeParam != "all_time"):
		// Last 7 days
		points = make([]models.StockFlowPoint, 7)
		dayMap := make(map[string]int)
		for i := 6; i >= 0; i-- {
			d := now.AddDate(0, 0, -i)
			dateKey := d.Format("2006-01-02")
			label := d.Format("Mon")
			idx := 6 - i
			points[idx] = models.StockFlowPoint{Label: label, Date: dateKey}
			dayMap[dateKey] = idx
		}

		for _, m := range movements {
			dateKey := m.CreatedAt.In(userLoc).Format("2006-01-02")
			if idx, ok := dayMap[dateKey]; ok {
				if m.MovementType == models.MovementTypeStockIn {
					points[idx].Inbound += m.Quantity
				} else if m.MovementType == models.MovementTypeStockOut {
					qty := m.Quantity
					if qty < 0 {
						qty = -qty
					}
					points[idx].Outbound += qty
				}
			}
		}

	case rangeParam == "this_month":
		// 4 Weeks of current month
		points = []models.StockFlowPoint{
			{Label: "Week 1"},
			{Label: "Week 2"},
			{Label: "Week 3"},
			{Label: "Week 4"},
		}
		currentYear, currentMonth, _ := now.Date()
		for _, m := range movements {
			mTime := m.CreatedAt.In(userLoc)
			mYear, mMonth, mDay := mTime.Date()
			if mYear == currentYear && mMonth == currentMonth {
				weekIdx := (mDay - 1) / 7
				if weekIdx > 3 {
					weekIdx = 3
				}
				if m.MovementType == models.MovementTypeStockIn {
					points[weekIdx].Inbound += m.Quantity
				} else if m.MovementType == models.MovementTypeStockOut {
					qty := m.Quantity
					if qty < 0 {
						qty = -qty
					}
					points[weekIdx].Outbound += qty
				}
			}
		}

	case rangeParam == "last_30d" || rangeParam == "30d":
		// Group into 6 5-day intervals
		points = []models.StockFlowPoint{
			{Label: "1-5 d"},
			{Label: "6-10 d"},
			{Label: "11-15 d"},
			{Label: "16-20 d"},
			{Label: "21-25 d"},
			{Label: "26-30 d"},
		}
		for _, m := range movements {
			mTime := m.CreatedAt.In(userLoc)
			diffDays := int(now.Sub(mTime).Hours() / 24)
			if diffDays >= 0 && diffDays < 30 {
				bucket := diffDays / 5
				if bucket >= 0 && bucket < len(points) {
					if m.MovementType == models.MovementTypeStockIn {
						points[bucket].Inbound += m.Quantity
					} else if m.MovementType == models.MovementTypeStockOut {
						qty := m.Quantity
						if qty < 0 {
							qty = -qty
						}
						points[bucket].Outbound += qty
					}
				}
			}
		}

	default: // "all_time" or "monthly"
		months := []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
		points = make([]models.StockFlowPoint, 12)
		for i, mName := range months {
			points[i] = models.StockFlowPoint{Label: mName}
		}

		currentYear := now.Year()
		for _, m := range movements {
			mTime := m.CreatedAt.In(userLoc)
			if mTime.Year() == currentYear {
				monthIdx := int(mTime.Month()) - 1
				if monthIdx >= 0 && monthIdx < 12 {
					if m.MovementType == models.MovementTypeStockIn {
						points[monthIdx].Inbound += m.Quantity
					} else if m.MovementType == models.MovementTypeStockOut {
						qty := m.Quantity
						if qty < 0 {
							qty = -qty
						}
						points[monthIdx].Outbound += qty
					}
				}
			}
		}
	}

	var totalIn, totalOut int
	for _, p := range points {
		totalIn += p.Inbound
		totalOut += p.Outbound
	}

	return &models.StockFlowResponse{
		Points:        points,
		TotalInbound:  totalIn,
		TotalOutbound: totalOut,
	}, nil
}

func (s *inventoryService) GetWarehouseCapacityAnalytics(ctx context.Context) (*models.WarehouseCapacityResponse, error) {
	warehouses, err := s.warehouseRepo.FindWarehouses(ctx)
	if err != nil {
		return nil, err
	}

	items, _, err := s.inventoryRepo.FindItems(ctx, models.InventoryQueryParam{Limit: 2000})
	if err != nil {
		return nil, err
	}

	stockByWh := make(map[string]int)
	for _, it := range items {
		stockByWh[it.WarehouseID.Hex()] += it.QuantityOnHand
	}

	var totalCapacity int
	var totalOnHand int
	for _, wh := range warehouses {
		totalCapacity += wh.Capacity
		totalOnHand += stockByWh[wh.ID.Hex()]
	}

	itemsList := make([]models.WarehouseCapacityItem, 0, len(warehouses))
	for _, wh := range warehouses {
		currentStock := stockByWh[wh.ID.Hex()]
		var pct float64
		if wh.Capacity > 0 {
			pct = (float64(currentStock) / float64(wh.Capacity)) * 100
		}
		itemsList = append(itemsList, models.WarehouseCapacityItem{
			WarehouseID:  wh.ID.Hex(),
			Name:         wh.Name,
			CurrentStock: currentStock,
			Capacity:     wh.Capacity,
			Percentage:   math.Round(pct*10) / 10,
		})
	}

	var utilRate float64
	if totalCapacity > 0 {
		utilRate = (float64(totalOnHand) / float64(totalCapacity)) * 100
	}

	return &models.WarehouseCapacityResponse{
		Warehouses:      itemsList,
		TotalCapacity:   totalCapacity,
		TotalOnHand:     totalOnHand,
		UtilizationRate: math.Round(utilRate*10) / 10,
	}, nil
}
