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
	ErrCustomerNotFound    = errors.New("customer not found")
	ErrCustomerCodeExists  = errors.New("customer code already exists")
	ErrSONotFound          = errors.New("sales order not found")
	ErrSOOrderNumberExists = errors.New("sales order number already exists")
	ErrSOInvalidStatus     = errors.New("invalid sales order status transition")
	ErrSOAlreadyLocked     = errors.New("sales order is locked and cannot be modified")
)

type SORepository interface {
	// Customer methods
	CreateCustomer(ctx context.Context, c *models.Customer) error
	FindCustomerByID(ctx context.Context, id primitive.ObjectID) (*models.Customer, error)
	FindCustomerByCode(ctx context.Context, code string) (*models.Customer, error)
	ListCustomers(ctx context.Context) ([]models.Customer, error)
	UpdateCustomer(ctx context.Context, id primitive.ObjectID, c *models.Customer) error
	DeleteCustomer(ctx context.Context, id primitive.ObjectID) error
	CountCustomers(ctx context.Context) (int64, error)

	// Sales Order methods
	CreateSO(ctx context.Context, so *models.SalesOrder) error
	FindSOByID(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error)
	FindSOByOrderNumber(ctx context.Context, orderNumber string) (*models.SalesOrder, error)
	ListSOs(ctx context.Context, params models.SOQueryParam) ([]models.SalesOrder, int64, error)
	UpdateSO(ctx context.Context, id primitive.ObjectID, so *models.SalesOrder) error
	UpdateSOStatus(ctx context.Context, id primitive.ObjectID, status models.SOStatus) error
	UpdateSODispatch(ctx context.Context, id primitive.ObjectID, carrier, trackingNumber string, shippedAt time.Time, newStatus models.SOStatus) error
	UpdateSODelivered(ctx context.Context, id primitive.ObjectID, deliveredAt time.Time) error
	DeleteSO(ctx context.Context, id primitive.ObjectID) error
	GetSOStats(ctx context.Context) (*models.SOStatsResponse, error)
}

type mongoSORepository struct {
	customerColl *mongo.Collection
	soColl       *mongo.Collection
}

func NewSORepository(db *mongo.Database) SORepository {
	return &mongoSORepository{
		customerColl: db.Collection("customers"),
		soColl:       db.Collection("sales_orders"),
	}
}

// Customer methods
func (r *mongoSORepository) CreateCustomer(ctx context.Context, c *models.Customer) error {
	now := time.Now()
	if c.ID.IsZero() {
		c.ID = primitive.NewObjectID()
	}
	c.CreatedAt = now
	c.UpdatedAt = now

	_, err := r.customerColl.InsertOne(ctx, c)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrCustomerCodeExists
		}
		return err
	}
	return nil
}

func (r *mongoSORepository) FindCustomerByID(ctx context.Context, id primitive.ObjectID) (*models.Customer, error) {
	var c models.Customer
	err := r.customerColl.FindOne(ctx, bson.M{"_id": id}).Decode(&c)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrCustomerNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *mongoSORepository) FindCustomerByCode(ctx context.Context, code string) (*models.Customer, error) {
	var c models.Customer
	err := r.customerColl.FindOne(ctx, bson.M{"code": code}).Decode(&c)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrCustomerNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *mongoSORepository) ListCustomers(ctx context.Context) ([]models.Customer, error) {
	opts := options.Find().SetSort(bson.D{{Key: "name", Value: 1}})
	cursor, err := r.customerColl.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var customers []models.Customer
	if err := cursor.All(ctx, &customers); err != nil {
		return nil, err
	}
	if customers == nil {
		customers = []models.Customer{}
	}
	return customers, nil
}

func (r *mongoSORepository) UpdateCustomer(ctx context.Context, id primitive.ObjectID, c *models.Customer) error {
	c.UpdatedAt = time.Now()
	update := bson.M{
		"$set": bson.M{
			"name":       c.Name,
			"email":      c.Email,
			"phone":      c.Phone,
			"address":    c.Address,
			"city":       c.City,
			"is_active":  c.IsActive,
			"updated_at": c.UpdatedAt,
		},
	}
	res, err := r.customerColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrCustomerNotFound
	}
	return nil
}

func (r *mongoSORepository) DeleteCustomer(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.customerColl.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrCustomerNotFound
	}
	return nil
}

func (r *mongoSORepository) CountCustomers(ctx context.Context) (int64, error) {
	return r.customerColl.CountDocuments(ctx, bson.M{})
}

// Sales Order methods
func (r *mongoSORepository) CreateSO(ctx context.Context, so *models.SalesOrder) error {
	now := time.Now()
	if so.ID.IsZero() {
		so.ID = primitive.NewObjectID()
	}
	so.CreatedAt = now
	so.UpdatedAt = now

	_, err := r.soColl.InsertOne(ctx, so)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrSOOrderNumberExists
		}
		return err
	}
	return nil
}

func (r *mongoSORepository) FindSOByID(ctx context.Context, id primitive.ObjectID) (*models.SalesOrder, error) {
	var so models.SalesOrder
	err := r.soColl.FindOne(ctx, bson.M{"_id": id}).Decode(&so)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrSONotFound
		}
		return nil, err
	}
	return &so, nil
}

func (r *mongoSORepository) FindSOByOrderNumber(ctx context.Context, orderNumber string) (*models.SalesOrder, error) {
	var so models.SalesOrder
	err := r.soColl.FindOne(ctx, bson.M{"order_number": orderNumber}).Decode(&so)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrSONotFound
		}
		return nil, err
	}
	return &so, nil
}

func (r *mongoSORepository) ListSOs(ctx context.Context, params models.SOQueryParam) ([]models.SalesOrder, int64, error) {
	filter := bson.M{}
	if params.Status != "" {
		filter["status"] = params.Status
	}
	if params.CustomerID != "" {
		if custID, err := primitive.ObjectIDFromHex(params.CustomerID); err == nil {
			filter["customer_id"] = custID
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
			{"customer_name": bson.M{"$regex": safeSearch, "$options": "i"}},
			{"tracking_number": bson.M{"$regex": safeSearch, "$options": "i"}},
			{"notes": bson.M{"$regex": safeSearch, "$options": "i"}},
		}
	}

	total, err := r.soColl.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	findOptions := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	if params.Limit > 0 {
		findOptions.SetLimit(params.Limit)
		if params.Page > 1 {
			findOptions.SetSkip((params.Page - 1) * params.Limit)
		}
	}

	cursor, err := r.soColl.Find(ctx, filter, findOptions)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var orders []models.SalesOrder
	if err := cursor.All(ctx, &orders); err != nil {
		return nil, 0, err
	}
	if orders == nil {
		orders = []models.SalesOrder{}
	}
	return orders, total, nil
}

func (r *mongoSORepository) UpdateSO(ctx context.Context, id primitive.ObjectID, so *models.SalesOrder) error {
	so.UpdatedAt = time.Now()
	update := bson.M{
		"$set": bson.M{
			"shipping_address": so.ShippingAddress,
			"items":            so.Items,
			"total_quantity":   so.TotalQuantity,
			"total_amount":     so.TotalAmount,
			"notes":            so.Notes,
			"updated_at":       so.UpdatedAt,
		},
	}
	res, err := r.soColl.UpdateOne(ctx, bson.M{"_id": id, "status": models.SOStatusDraft}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrSOAlreadyLocked
	}
	return nil
}

func (r *mongoSORepository) UpdateSOStatus(ctx context.Context, id primitive.ObjectID, status models.SOStatus) error {
	now := time.Now()
	update := bson.M{
		"$set": bson.M{
			"status":     status,
			"updated_at": now,
		},
	}
	if status == models.SOStatusConfirmed {
		update["$set"].(bson.M)["confirmed_at"] = now
	}

	res, err := r.soColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrSONotFound
	}
	return nil
}

func (r *mongoSORepository) UpdateSODispatch(ctx context.Context, id primitive.ObjectID, carrier, trackingNumber string, shippedAt time.Time, newStatus models.SOStatus) error {
	now := time.Now()
	update := bson.M{
		"$set": bson.M{
			"carrier":         carrier,
			"tracking_number": trackingNumber,
			"shipped_at":      shippedAt,
			"status":          newStatus,
			"updated_at":      now,
		},
	}
	res, err := r.soColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrSONotFound
	}
	return nil
}

func (r *mongoSORepository) UpdateSODelivered(ctx context.Context, id primitive.ObjectID, deliveredAt time.Time) error {
	now := time.Now()
	update := bson.M{
		"$set": bson.M{
			"status":       models.SOStatusDelivered,
			"delivered_at": deliveredAt,
			"updated_at":   now,
		},
	}
	res, err := r.soColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrSONotFound
	}
	return nil
}

func (r *mongoSORepository) DeleteSO(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.soColl.DeleteOne(ctx, bson.M{"_id": id, "status": models.SOStatusDraft})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrSOAlreadyLocked
	}
	return nil
}

func (r *mongoSORepository) GetSOStats(ctx context.Context) (*models.SOStatsResponse, error) {
	cursor, err := r.soColl.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var orders []models.SalesOrder
	if err := cursor.All(ctx, &orders); err != nil {
		return nil, err
	}

	stats := &models.SOStatsResponse{}
	stats.TotalOrders = int64(len(orders))

	for _, so := range orders {
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
