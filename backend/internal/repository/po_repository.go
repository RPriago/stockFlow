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
	ErrSupplierNotFound    = errors.New("supplier not found")
	ErrSupplierCodeExists  = errors.New("supplier code already exists")
	ErrPONotFound          = errors.New("purchase order not found")
	ErrPOOrderNumberExists = errors.New("purchase order number already exists")
	ErrPOInvalidStatus     = errors.New("invalid purchase order status transition")
	ErrPOAlreadyLocked     = errors.New("purchase order is locked and cannot be edited")
)

type PORepository interface {
	// Supplier methods
	CreateSupplier(ctx context.Context, s *models.Supplier) error
	FindSupplierByID(ctx context.Context, id primitive.ObjectID) (*models.Supplier, error)
	FindSupplierByCode(ctx context.Context, code string) (*models.Supplier, error)
	ListSuppliers(ctx context.Context) ([]models.Supplier, error)
	UpdateSupplier(ctx context.Context, id primitive.ObjectID, s *models.Supplier) error
	DeleteSupplier(ctx context.Context, id primitive.ObjectID) error
	CountSuppliers(ctx context.Context) (int64, error)

	// Purchase Order methods
	CreatePO(ctx context.Context, po *models.PurchaseOrder) error
	FindPOByID(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error)
	FindPOByOrderNumber(ctx context.Context, orderNumber string) (*models.PurchaseOrder, error)
	ListPOs(ctx context.Context, params models.POQueryParam) ([]models.PurchaseOrder, int64, error)
	UpdatePO(ctx context.Context, id primitive.ObjectID, po *models.PurchaseOrder) error
	UpdatePOStatus(ctx context.Context, id primitive.ObjectID, status models.POStatus) error
	UpdatePOReceivedItems(ctx context.Context, id primitive.ObjectID, items []models.POItem, totalReceived int, newStatus models.POStatus) error
	DeletePO(ctx context.Context, id primitive.ObjectID) error
	GetPOStats(ctx context.Context) (*models.POStatsResponse, error)
}

type mongoPORepository struct {
	supplierColl *mongo.Collection
	poColl       *mongo.Collection
}

func NewPORepository(db *mongo.Database) PORepository {
	return &mongoPORepository{
		supplierColl: db.Collection("suppliers"),
		poColl:       db.Collection("purchase_orders"),
	}
}

// Supplier methods
func (r *mongoPORepository) CreateSupplier(ctx context.Context, s *models.Supplier) error {
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now
	if s.ID.IsZero() {
		s.ID = primitive.NewObjectID()
	}

	_, err := r.supplierColl.InsertOne(ctx, s)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrSupplierCodeExists
		}
		return err
	}
	return nil
}

func (r *mongoPORepository) FindSupplierByID(ctx context.Context, id primitive.ObjectID) (*models.Supplier, error) {
	var s models.Supplier
	err := r.supplierColl.FindOne(ctx, bson.M{"_id": id}).Decode(&s)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrSupplierNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *mongoPORepository) FindSupplierByCode(ctx context.Context, code string) (*models.Supplier, error) {
	var s models.Supplier
	err := r.supplierColl.FindOne(ctx, bson.M{"code": code}).Decode(&s)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrSupplierNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *mongoPORepository) ListSuppliers(ctx context.Context) ([]models.Supplier, error) {
	cursor, err := r.supplierColl.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "name", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var suppliers []models.Supplier
	if err := cursor.All(ctx, &suppliers); err != nil {
		return nil, err
	}
	if suppliers == nil {
		suppliers = []models.Supplier{}
	}
	return suppliers, nil
}

func (r *mongoPORepository) UpdateSupplier(ctx context.Context, id primitive.ObjectID, s *models.Supplier) error {
	s.UpdatedAt = time.Now()
	update := bson.M{
		"$set": bson.M{
			"code":           s.Code,
			"name":           s.Name,
			"email":          s.Email,
			"phone":          s.Phone,
			"address":        s.Address,
			"contact_person": s.ContactPerson,
			"is_active":      s.IsActive,
			"updated_at":     s.UpdatedAt,
		},
	}
	res, err := r.supplierColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrSupplierCodeExists
		}
		return err
	}
	if res.MatchedCount == 0 {
		return ErrSupplierNotFound
	}
	return nil
}

func (r *mongoPORepository) DeleteSupplier(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.supplierColl.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrSupplierNotFound
	}
	return nil
}

func (r *mongoPORepository) CountSuppliers(ctx context.Context) (int64, error) {
	return r.supplierColl.CountDocuments(ctx, bson.M{})
}

// Purchase Order methods
func (r *mongoPORepository) CreatePO(ctx context.Context, po *models.PurchaseOrder) error {
	now := time.Now()
	po.CreatedAt = now
	po.UpdatedAt = now
	if po.ID.IsZero() {
		po.ID = primitive.NewObjectID()
	}

	_, err := r.poColl.InsertOne(ctx, po)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrPOOrderNumberExists
		}
		return err
	}
	return nil
}

func (r *mongoPORepository) FindPOByID(ctx context.Context, id primitive.ObjectID) (*models.PurchaseOrder, error) {
	var po models.PurchaseOrder
	err := r.poColl.FindOne(ctx, bson.M{"_id": id}).Decode(&po)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrPONotFound
		}
		return nil, err
	}
	return &po, nil
}

func (r *mongoPORepository) FindPOByOrderNumber(ctx context.Context, orderNumber string) (*models.PurchaseOrder, error) {
	var po models.PurchaseOrder
	err := r.poColl.FindOne(ctx, bson.M{"order_number": orderNumber}).Decode(&po)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrPONotFound
		}
		return nil, err
	}
	return &po, nil
}

func (r *mongoPORepository) ListPOs(ctx context.Context, params models.POQueryParam) ([]models.PurchaseOrder, int64, error) {
	filter := bson.M{}
	if params.Status != "" {
		filter["status"] = params.Status
	}
	if params.SupplierID != "" {
		if sID, err := primitive.ObjectIDFromHex(params.SupplierID); err == nil {
			filter["supplier_id"] = sID
		}
	}
	if params.WarehouseID != "" {
		if whID, err := primitive.ObjectIDFromHex(params.WarehouseID); err == nil {
			filter["warehouse_id"] = whID
		}
	}
	if params.Search != "" {
		safeSearch := regexp.QuoteMeta(params.Search)
		filter["$or"] = []bson.M{
			{"order_number": bson.M{"$regex": safeSearch, "$options": "i"}},
			{"supplier_name": bson.M{"$regex": safeSearch, "$options": "i"}},
			{"notes": bson.M{"$regex": safeSearch, "$options": "i"}},
		}
	}

	total, err := r.poColl.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	limit := int64(20)
	if params.Limit > 0 {
		limit = params.Limit
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

	cursor, err := r.poColl.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var orders []models.PurchaseOrder
	if err := cursor.All(ctx, &orders); err != nil {
		return nil, 0, err
	}
	if orders == nil {
		orders = []models.PurchaseOrder{}
	}

	return orders, total, nil
}

func (r *mongoPORepository) UpdatePO(ctx context.Context, id primitive.ObjectID, po *models.PurchaseOrder) error {
	po.UpdatedAt = time.Now()
	update := bson.M{
		"$set": bson.M{
			"supplier_id":            po.SupplierID,
			"supplier_name":          po.SupplierName,
			"warehouse_id":           po.WarehouseID,
			"warehouse_name":         po.WarehouseName,
			"items":                  po.Items,
			"total_quantity_ordered": po.TotalQuantityOrdered,
			"total_amount":           po.TotalAmount,
			"expected_date":          po.ExpectedDate,
			"notes":                  po.Notes,
			"updated_at":             po.UpdatedAt,
		},
	}
	res, err := r.poColl.UpdateOne(ctx, bson.M{"_id": id, "status": models.POStatusDraft}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrPOAlreadyLocked
	}
	return nil
}

func (r *mongoPORepository) UpdatePOStatus(ctx context.Context, id primitive.ObjectID, status models.POStatus) error {
	update := bson.M{
		"$set": bson.M{
			"status":     status,
			"updated_at": time.Now(),
		},
	}
	res, err := r.poColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrPONotFound
	}
	return nil
}

func (r *mongoPORepository) UpdatePOReceivedItems(ctx context.Context, id primitive.ObjectID, items []models.POItem, totalReceived int, newStatus models.POStatus) error {
	update := bson.M{
		"$set": bson.M{
			"items":                   items,
			"total_quantity_received": totalReceived,
			"status":                  newStatus,
			"updated_at":              time.Now(),
		},
	}
	res, err := r.poColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrPONotFound
	}
	return nil
}

func (r *mongoPORepository) DeletePO(ctx context.Context, id primitive.ObjectID) error {
	// Only drafts can be deleted
	res, err := r.poColl.DeleteOne(ctx, bson.M{"_id": id, "status": models.POStatusDraft})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("cannot delete purchase order: only draft orders can be deleted")
	}
	return nil
}

func (r *mongoPORepository) GetPOStats(ctx context.Context) (*models.POStatsResponse, error) {
	stats := &models.POStatsResponse{}

	// Total count
	total, err := r.poColl.CountDocuments(ctx, bson.M{})
	if err == nil {
		stats.TotalOrders = total
	}

	drafts, _ := r.poColl.CountDocuments(ctx, bson.M{"status": models.POStatusDraft})
	stats.DraftOrders = drafts

	pending, _ := r.poColl.CountDocuments(ctx, bson.M{"status": bson.M{"$in": []string{string(models.POStatusOrdered), string(models.POStatusPartiallyReceived)}}})
	stats.PendingOrders = pending

	completed, _ := r.poColl.CountDocuments(ctx, bson.M{"status": models.POStatusReceived})
	stats.CompletedOrders = completed

	cancelled, _ := r.poColl.CountDocuments(ctx, bson.M{"status": models.POStatusCancelled})
	stats.CancelledOrders = cancelled

	// Sum total amount of non-cancelled orders
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.D{{Key: "status", Value: bson.D{{Key: "$ne", Value: string(models.POStatusCancelled)}}}}}},
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: nil},
			{Key: "total_procurement", Value: bson.D{{Key: "$sum", Value: "$total_amount"}}},
		}}},
	}

	cursor, err := r.poColl.Aggregate(ctx, pipeline)
	if err == nil && cursor.Next(ctx) {
		var result struct {
			TotalProcurement float64 `bson:"total_procurement"`
		}
		if err := cursor.Decode(&result); err == nil {
			stats.TotalProcurement = result.TotalProcurement
		}
	}

	return stats, nil
}
