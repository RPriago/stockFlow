package repository

import (
	"context"
	"errors"
	"time"

	"stockflow-backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	ErrWarehouseNotFound   = errors.New("warehouse not found")
	ErrWarehouseCodeExists = errors.New("warehouse code already exists")
	ErrLocationNotFound    = errors.New("location not found")
	ErrLocationCodeExists  = errors.New("location code already exists in this warehouse")
)

type WarehouseRepository interface {
	CreateWarehouse(ctx context.Context, wh *models.Warehouse) error
	FindWarehouseByID(ctx context.Context, id primitive.ObjectID) (*models.Warehouse, error)
	FindWarehouseByCode(ctx context.Context, code string) (*models.Warehouse, error)
	FindWarehouses(ctx context.Context) ([]models.Warehouse, error)
	UpdateWarehouse(ctx context.Context, id primitive.ObjectID, wh *models.Warehouse) error
	DeleteWarehouse(ctx context.Context, id primitive.ObjectID) error
	CountWarehouses(ctx context.Context) (int64, error)

	CreateLocation(ctx context.Context, loc *models.Location) error
	FindLocationsByWarehouse(ctx context.Context, warehouseID primitive.ObjectID) ([]models.Location, error)
	FindLocationByID(ctx context.Context, id primitive.ObjectID) (*models.Location, error)
	FindLocationByCode(ctx context.Context, warehouseID primitive.ObjectID, code string) (*models.Location, error)
	DeleteLocation(ctx context.Context, id primitive.ObjectID) error
	CountLocationsByWarehouse(ctx context.Context, warehouseID primitive.ObjectID) (int64, error)
}

type mongoWarehouseRepository struct {
	warehouseColl *mongo.Collection
	locationColl  *mongo.Collection
}

func NewWarehouseRepository(db *mongo.Database) WarehouseRepository {
	return &mongoWarehouseRepository{
		warehouseColl: db.Collection("warehouses"),
		locationColl:  db.Collection("locations"),
	}
}

func (r *mongoWarehouseRepository) CreateWarehouse(ctx context.Context, wh *models.Warehouse) error {
	now := time.Now()
	wh.CreatedAt = now
	wh.UpdatedAt = now
	if wh.ID.IsZero() {
		wh.ID = primitive.NewObjectID()
	}

	_, err := r.warehouseColl.InsertOne(ctx, wh)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrWarehouseCodeExists
		}
		return err
	}
	return nil
}

func (r *mongoWarehouseRepository) FindWarehouseByID(ctx context.Context, id primitive.ObjectID) (*models.Warehouse, error) {
	var wh models.Warehouse
	err := r.warehouseColl.FindOne(ctx, bson.M{"_id": id}).Decode(&wh)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrWarehouseNotFound
		}
		return nil, err
	}
	return &wh, nil
}

func (r *mongoWarehouseRepository) FindWarehouseByCode(ctx context.Context, code string) (*models.Warehouse, error) {
	var wh models.Warehouse
	err := r.warehouseColl.FindOne(ctx, bson.M{"code": code}).Decode(&wh)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrWarehouseNotFound
		}
		return nil, err
	}
	return &wh, nil
}

func (r *mongoWarehouseRepository) FindWarehouses(ctx context.Context) ([]models.Warehouse, error) {
	findOptions := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})
	cursor, err := r.warehouseColl.Find(ctx, bson.M{}, findOptions)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var warehouses []models.Warehouse
	if err := cursor.All(ctx, &warehouses); err != nil {
		return nil, err
	}
	if warehouses == nil {
		warehouses = []models.Warehouse{}
	}

	for i := range warehouses {
		binCount, _ := r.locationColl.CountDocuments(ctx, bson.M{"warehouse_id": warehouses[i].ID})
		warehouses[i].TotalBins = int(binCount)
	}

	return warehouses, nil
}

func (r *mongoWarehouseRepository) UpdateWarehouse(ctx context.Context, id primitive.ObjectID, wh *models.Warehouse) error {
	wh.UpdatedAt = time.Now()
	update := bson.M{
		"$set": bson.M{
			"code":       wh.Code,
			"name":       wh.Name,
			"address":    wh.Address,
			"city":       wh.City,
			"capacity":   wh.Capacity,
			"is_active":  wh.IsActive,
			"updated_at": wh.UpdatedAt,
		},
	}

	res, err := r.warehouseColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrWarehouseCodeExists
		}
		return err
	}
	if res.MatchedCount == 0 {
		return ErrWarehouseNotFound
	}
	return nil
}

func (r *mongoWarehouseRepository) DeleteWarehouse(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.warehouseColl.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrWarehouseNotFound
	}
	// Also delete child locations
	_, _ = r.locationColl.DeleteMany(ctx, bson.M{"warehouse_id": id})
	return nil
}

func (r *mongoWarehouseRepository) CountWarehouses(ctx context.Context) (int64, error) {
	return r.warehouseColl.CountDocuments(ctx, bson.M{})
}

func (r *mongoWarehouseRepository) CreateLocation(ctx context.Context, loc *models.Location) error {
	loc.CreatedAt = time.Now()
	if loc.ID.IsZero() {
		loc.ID = primitive.NewObjectID()
	}

	_, err := r.locationColl.InsertOne(ctx, loc)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrLocationCodeExists
		}
		return err
	}
	return nil
}

func (r *mongoWarehouseRepository) FindLocationsByWarehouse(ctx context.Context, warehouseID primitive.ObjectID) ([]models.Location, error) {
	findOptions := options.Find().SetSort(bson.D{{Key: "zone", Value: 1}, {Key: "code", Value: 1}})
	cursor, err := r.locationColl.Find(ctx, bson.M{"warehouse_id": warehouseID}, findOptions)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var locations []models.Location
	if err := cursor.All(ctx, &locations); err != nil {
		return nil, err
	}
	if locations == nil {
		locations = []models.Location{}
	}
	return locations, nil
}

func (r *mongoWarehouseRepository) FindLocationByID(ctx context.Context, id primitive.ObjectID) (*models.Location, error) {
	var loc models.Location
	err := r.locationColl.FindOne(ctx, bson.M{"_id": id}).Decode(&loc)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrLocationNotFound
		}
		return nil, err
	}
	return &loc, nil
}

func (r *mongoWarehouseRepository) FindLocationByCode(ctx context.Context, warehouseID primitive.ObjectID, code string) (*models.Location, error) {
	var loc models.Location
	err := r.locationColl.FindOne(ctx, bson.M{"warehouse_id": warehouseID, "code": code}).Decode(&loc)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrLocationNotFound
		}
		return nil, err
	}
	return &loc, nil
}

func (r *mongoWarehouseRepository) DeleteLocation(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.locationColl.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrLocationNotFound
	}
	return nil
}

func (r *mongoWarehouseRepository) CountLocationsByWarehouse(ctx context.Context, warehouseID primitive.ObjectID) (int64, error) {
	return r.locationColl.CountDocuments(ctx, bson.M{"warehouse_id": warehouseID})
}
