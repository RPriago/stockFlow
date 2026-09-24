package repository

import (
	"context"
	"errors"
	"regexp"
	"time"

	"stockflow-backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	ErrInventoryNotFound         = errors.New("inventory item not found at this location")
	ErrInsufficientStock         = errors.New("insufficient available stock")
	ErrInvalidStockAmount        = errors.New("invalid stock quantity: must be greater than 0")
	ErrCannotAdjustBelowReserved = errors.New("actual quantity cannot be less than currently reserved stock")
)

type InventoryRepository interface {
	StockIn(ctx context.Context, item *models.InventoryItem, qty int) (*models.InventoryItem, int, error)                                                        // returns (updatedItem, balanceBefore, err)
	StockOut(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, int, error)          // returns (updatedItem, balanceBefore, err)
	AdjustStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, actualQty int) (*models.InventoryItem, int, error) // returns (updatedItem, balanceBefore, err)
	ReserveStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, error)
	ReleaseStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, error)
	DeductReservedStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, int, error) // returns (updatedItem, balanceBefore, err)

	FindItem(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string) (*models.InventoryItem, error)
	FindItemByID(ctx context.Context, id primitive.ObjectID) (*models.InventoryItem, error)
	FindItems(ctx context.Context, params models.InventoryQueryParam) ([]models.InventoryItem, int64, error)

	RecordMovement(ctx context.Context, movement *models.InventoryMovement) error
	FindMovements(ctx context.Context, params models.MovementQueryParam) ([]models.InventoryMovement, int64, error)
	GetStats(ctx context.Context) (*models.InventoryStatsResponse, error)
	GetTotalStockByWarehouse(ctx context.Context) (map[string]int, error)
}

type mongoInventoryRepository struct {
	inventoryColl *mongo.Collection
	movementColl  *mongo.Collection
}

func NewInventoryRepository(db *mongo.Database) InventoryRepository {
	return &mongoInventoryRepository{
		inventoryColl: db.Collection("inventory_items"),
		movementColl:  db.Collection("inventory_movements"),
	}
}

func (r *mongoInventoryRepository) StockIn(ctx context.Context, item *models.InventoryItem, qty int) (*models.InventoryItem, int, error) {
	if qty <= 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	filter := bson.M{
		"warehouse_id": item.WarehouseID,
		"location_id":  item.LocationID,
		"product_id":   item.ProductID,
		"variant_id":   item.VariantID,
	}

	// First find if already exists to know balance before
	var existing models.InventoryItem
	balanceBefore := 0
	err := r.inventoryColl.FindOne(ctx, filter).Decode(&existing)
	if err == nil {
		balanceBefore = existing.QuantityOnHand
	}

	now := time.Now()
	update := bson.M{
		"$inc": bson.M{
			"quantity_on_hand":   qty,
			"quantity_available": qty,
		},
		"$set": bson.M{
			"product_name":   item.ProductName,
			"sku":            item.SKU,
			"warehouse_name": item.WarehouseName,
			"location_code":  item.LocationCode,
			"min_stock":      item.MinStock,
			"unit":           item.Unit,
			"updated_at":     now,
		},
		"$setOnInsert": bson.M{
			"_id":               primitive.NewObjectID(),
			"quantity_reserved": 0,
		},
	}

	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	var updated models.InventoryItem
	if err := r.inventoryColl.FindOneAndUpdate(ctx, filter, update, opts).Decode(&updated); err != nil {
		return nil, 0, err
	}

	return &updated, balanceBefore, nil
}

func (r *mongoInventoryRepository) StockOut(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, int, error) {
	if qty <= 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	filter := bson.M{
		"warehouse_id":       warehouseID,
		"location_id":        locationID,
		"product_id":         productID,
		"variant_id":         variantID,
		"quantity_available": bson.M{"$gte": qty},
	}

	now := time.Now()
	update := bson.M{
		"$inc": bson.M{
			"quantity_on_hand":   -qty,
			"quantity_available": -qty,
		},
		"$set": bson.M{
			"updated_at": now,
		},
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.InventoryItem
	err := r.inventoryColl.FindOneAndUpdate(ctx, filter, update, opts).Decode(&updated)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			// Check if item exists at all
			var check models.InventoryItem
			checkFilter := bson.M{
				"warehouse_id": warehouseID,
				"location_id":  locationID,
				"product_id":   productID,
				"variant_id":   variantID,
			}
			if errCheck := r.inventoryColl.FindOne(ctx, checkFilter).Decode(&check); errCheck != nil {
				return nil, 0, ErrInventoryNotFound
			}
			return nil, check.QuantityOnHand, ErrInsufficientStock
		}
		return nil, 0, err
	}

	balanceBefore := updated.QuantityOnHand + qty
	return &updated, balanceBefore, nil
}

func (r *mongoInventoryRepository) AdjustStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, actualQty int) (*models.InventoryItem, int, error) {
	if actualQty < 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	filter := bson.M{
		"warehouse_id": warehouseID,
		"location_id":  locationID,
		"product_id":   productID,
		"variant_id":   variantID,
	}

	var existing models.InventoryItem
	if err := r.inventoryColl.FindOne(ctx, filter).Decode(&existing); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, 0, ErrInventoryNotFound
		}
		return nil, 0, err
	}

	if actualQty < existing.QuantityReserved {
		return nil, existing.QuantityOnHand, ErrCannotAdjustBelowReserved
	}

	balanceBefore := existing.QuantityOnHand
	newAvailable := actualQty - existing.QuantityReserved
	now := time.Now()

	update := bson.M{
		"$set": bson.M{
			"quantity_on_hand":   actualQty,
			"quantity_available": newAvailable,
			"updated_at":         now,
		},
	}

	// Concurrency guard: only update if quantity_reserved hasn't changed concurrently
	conditionalFilter := bson.M{
		"_id":               existing.ID,
		"quantity_reserved": existing.QuantityReserved,
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.InventoryItem
	if err := r.inventoryColl.FindOneAndUpdate(ctx, conditionalFilter, update, opts).Decode(&updated); err != nil {
		return nil, balanceBefore, err
	}

	return &updated, balanceBefore, nil
}

func (r *mongoInventoryRepository) ReserveStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, error) {
	if qty <= 0 {
		return nil, ErrInvalidStockAmount
	}

	filter := bson.M{
		"warehouse_id":       warehouseID,
		"location_id":        locationID,
		"product_id":         productID,
		"variant_id":         variantID,
		"quantity_available": bson.M{"$gte": qty},
	}

	update := bson.M{
		"$inc": bson.M{
			"quantity_reserved":  qty,
			"quantity_available": -qty,
		},
		"$set": bson.M{
			"updated_at": time.Now(),
		},
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.InventoryItem
	if err := r.inventoryColl.FindOneAndUpdate(ctx, filter, update, opts).Decode(&updated); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrInsufficientStock
		}
		return nil, err
	}
	return &updated, nil
}

func (r *mongoInventoryRepository) ReleaseStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, error) {
	if qty <= 0 {
		return nil, ErrInvalidStockAmount
	}

	filter := bson.M{
		"warehouse_id":      warehouseID,
		"location_id":       locationID,
		"product_id":        productID,
		"variant_id":        variantID,
		"quantity_reserved": bson.M{"$gte": qty},
	}

	update := bson.M{
		"$inc": bson.M{
			"quantity_reserved":  -qty,
			"quantity_available": qty,
		},
		"$set": bson.M{
			"updated_at": time.Now(),
		},
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.InventoryItem
	if err := r.inventoryColl.FindOneAndUpdate(ctx, filter, update, opts).Decode(&updated); err != nil {
		return nil, err
	}
	return &updated, nil
}

func (r *mongoInventoryRepository) DeductReservedStock(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string, qty int) (*models.InventoryItem, int, error) {
	if qty <= 0 {
		return nil, 0, ErrInvalidStockAmount
	}

	filter := bson.M{
		"warehouse_id":      warehouseID,
		"location_id":       locationID,
		"product_id":        productID,
		"variant_id":        variantID,
		"quantity_reserved": bson.M{"$gte": qty},
	}

	update := bson.M{
		"$inc": bson.M{
			"quantity_on_hand":  -qty,
			"quantity_reserved": -qty,
		},
		"$set": bson.M{
			"updated_at": time.Now(),
		},
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.InventoryItem
	if err := r.inventoryColl.FindOneAndUpdate(ctx, filter, update, opts).Decode(&updated); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, 0, ErrInsufficientStock
		}
		return nil, 0, err
	}

	balanceBefore := updated.QuantityOnHand + qty
	return &updated, balanceBefore, nil
}

func (r *mongoInventoryRepository) FindItem(ctx context.Context, warehouseID, locationID, productID primitive.ObjectID, variantID string) (*models.InventoryItem, error) {
	filter := bson.M{
		"warehouse_id": warehouseID,
		"location_id":  locationID,
		"product_id":   productID,
		"variant_id":   variantID,
	}

	var item models.InventoryItem
	if err := r.inventoryColl.FindOne(ctx, filter).Decode(&item); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrInventoryNotFound
		}
		return nil, err
	}
	return &item, nil
}

func (r *mongoInventoryRepository) FindItemByID(ctx context.Context, id primitive.ObjectID) (*models.InventoryItem, error) {
	var item models.InventoryItem
	if err := r.inventoryColl.FindOne(ctx, bson.M{"_id": id}).Decode(&item); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrInventoryNotFound
		}
		return nil, err
	}
	return &item, nil
}

func (r *mongoInventoryRepository) FindItems(ctx context.Context, params models.InventoryQueryParam) ([]models.InventoryItem, int64, error) {
	filter := bson.M{}
	if params.WarehouseID != "" {
		if whID, err := primitive.ObjectIDFromHex(params.WarehouseID); err == nil {
			filter["warehouse_id"] = whID
		}
	}
	if params.LocationID != "" {
		if locID, err := primitive.ObjectIDFromHex(params.LocationID); err == nil {
			filter["location_id"] = locID
		}
	}
	if params.ProductID != "" {
		if prodID, err := primitive.ObjectIDFromHex(params.ProductID); err == nil {
			filter["product_id"] = prodID
		}
	}
	if params.Search != "" {
		safeSearch := regexp.QuoteMeta(params.Search)
		filter["$or"] = []bson.M{
			{"product_name": bson.M{"$regex": safeSearch, "$options": "i"}},
			{"sku": bson.M{"$regex": safeSearch, "$options": "i"}},
			{"location_code": bson.M{"$regex": safeSearch, "$options": "i"}},
		}
	}
	if params.LowStockOnly {
		filter["$expr"] = bson.M{"$lte": []interface{}{"$quantity_available", "$min_stock"}}
	}

	total, err := r.inventoryColl.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

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
	skip := (page - 1) * limit

	findOpts := options.Find().
		SetSort(bson.D{{Key: "product_name", Value: 1}}).
		SetSkip(skip).
		SetLimit(limit)

	cursor, err := r.inventoryColl.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var items []models.InventoryItem
	if err := cursor.All(ctx, &items); err != nil {
		return nil, 0, err
	}
	if items == nil {
		items = []models.InventoryItem{}
	}

	return items, total, nil
}

func (r *mongoInventoryRepository) RecordMovement(ctx context.Context, movement *models.InventoryMovement) error {
	if movement.ID.IsZero() {
		movement.ID = primitive.NewObjectID()
	}
	if movement.CreatedAt.IsZero() {
		movement.CreatedAt = time.Now()
	}

	_, err := r.movementColl.InsertOne(ctx, movement)
	return err
}

func (r *mongoInventoryRepository) FindMovements(ctx context.Context, params models.MovementQueryParam) ([]models.InventoryMovement, int64, error) {
	filter := bson.M{}
	if params.WarehouseID != "" {
		if whID, err := primitive.ObjectIDFromHex(params.WarehouseID); err == nil {
			filter["warehouse_id"] = whID
		}
	}
	if params.ProductID != "" {
		if prodID, err := primitive.ObjectIDFromHex(params.ProductID); err == nil {
			filter["product_id"] = prodID
		}
	}
	if params.MovementType != "" {
		filter["movement_type"] = params.MovementType
	}

	total, err := r.movementColl.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

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
	skip := (page - 1) * limit

	findOpts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(skip).
		SetLimit(limit)

	cursor, err := r.movementColl.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var movements []models.InventoryMovement
	if err := cursor.All(ctx, &movements); err != nil {
		return nil, 0, err
	}
	if movements == nil {
		movements = []models.InventoryMovement{}
	}

	return movements, total, nil
}

func (r *mongoInventoryRepository) GetStats(ctx context.Context) (*models.InventoryStatsResponse, error) {
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: nil},
			{Key: "total_on_hand", Value: bson.D{{Key: "$sum", Value: "$quantity_on_hand"}}},
			{Key: "total_available", Value: bson.D{{Key: "$sum", Value: "$quantity_available"}}},
			{Key: "total_reserved", Value: bson.D{{Key: "$sum", Value: "$quantity_reserved"}}},
			{Key: "total_items", Value: bson.D{{Key: "$sum", Value: 1}}},
		}}},
	}

	cursor, err := r.inventoryColl.Aggregate(ctx, pipeline)
	stats := &models.InventoryStatsResponse{}
	if err == nil && cursor.Next(ctx) {
		var result struct {
			TotalOnHand    int   `bson:"total_on_hand"`
			TotalAvailable int   `bson:"total_available"`
			TotalReserved  int   `bson:"total_reserved"`
			TotalItems     int64 `bson:"total_items"`
		}
		if err := cursor.Decode(&result); err == nil {
			stats.TotalOnHand = result.TotalOnHand
			stats.TotalAvailable = result.TotalAvailable
			stats.TotalReserved = result.TotalReserved
			stats.TotalItemsCount = result.TotalItems
		}
	}

	// Count low stock
	lowStockCount, err := r.inventoryColl.CountDocuments(ctx, bson.M{
		"$expr": bson.M{"$lte": []interface{}{"$quantity_available", "$min_stock"}},
	})
	if err == nil {
		stats.LowStockItemsCount = lowStockCount
	}

	// Count movements today
	startOfDay := time.Now().Truncate(24 * time.Hour)
	movementsToday, err := r.movementColl.CountDocuments(ctx, bson.M{
		"created_at": bson.M{"$gte": startOfDay},
	})
	if err == nil {
		stats.MovementsToday = movementsToday
	}

	return stats, nil
}

// GetTotalStockByWarehouse computes total quantity on hand grouped by warehouse_id via MongoDB aggregation (PERF-002).
func (r *mongoInventoryRepository) GetTotalStockByWarehouse(ctx context.Context) (map[string]int, error) {
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$warehouse_id"},
			{Key: "total_stock", Value: bson.D{{Key: "$sum", Value: "$quantity_on_hand"}}},
		}}},
	}

	cursor, err := r.inventoryColl.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type aggResult struct {
		WarehouseID primitive.ObjectID `bson:"_id"`
		TotalStock  int                `bson:"total_stock"`
	}

	var results []aggResult
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	res := make(map[string]int, len(results))
	for _, r := range results {
		res[r.WarehouseID.Hex()] = r.TotalStock
	}
	return res, nil
}
