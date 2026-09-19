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
	ErrProductNotFound      = errors.New("product not found")
	ErrProductSKUExists     = errors.New("product with this SKU already exists")
	ErrCategoryNotFound     = errors.New("category not found")
	ErrCategoryAlreadyExist = errors.New("category with this name already exists")
)

type ProductRepository interface {
	CreateProduct(ctx context.Context, product *models.Product) error
	FindProductByID(ctx context.Context, id primitive.ObjectID) (*models.Product, error)
	FindProductBySKU(ctx context.Context, sku string) (*models.Product, error)
	FindProducts(ctx context.Context, params models.ProductQueryParam) ([]models.Product, int64, error)
	UpdateProduct(ctx context.Context, id primitive.ObjectID, product *models.Product) error
	DeleteProduct(ctx context.Context, id primitive.ObjectID) error
	CountProducts(ctx context.Context) (int64, error)

	CreateCategory(ctx context.Context, category *models.Category) error
	FindCategoryByID(ctx context.Context, id primitive.ObjectID) (*models.Category, error)
	FindCategoryBySlug(ctx context.Context, slug string) (*models.Category, error)
	ListCategories(ctx context.Context) ([]models.Category, error)
	CountCategories(ctx context.Context) (int64, error)
}

type mongoProductRepository struct {
	productColl  *mongo.Collection
	categoryColl *mongo.Collection
}

func NewProductRepository(db *mongo.Database) ProductRepository {
	return &mongoProductRepository{
		productColl:  db.Collection("products"),
		categoryColl: db.Collection("categories"),
	}
}

func (r *mongoProductRepository) CreateProduct(ctx context.Context, product *models.Product) error {
	now := time.Now()
	product.CreatedAt = now
	product.UpdatedAt = now
	if product.ID.IsZero() {
		product.ID = primitive.NewObjectID()
	}

	_, err := r.productColl.InsertOne(ctx, product)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrProductSKUExists
		}
		return err
	}
	return nil
}

func (r *mongoProductRepository) FindProductByID(ctx context.Context, id primitive.ObjectID) (*models.Product, error) {
	var product models.Product
	err := r.productColl.FindOne(ctx, bson.M{"_id": id}).Decode(&product)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	return &product, nil
}

func (r *mongoProductRepository) FindProductBySKU(ctx context.Context, sku string) (*models.Product, error) {
	var product models.Product
	err := r.productColl.FindOne(ctx, bson.M{"sku": sku}).Decode(&product)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	return &product, nil
}

func (r *mongoProductRepository) FindProducts(ctx context.Context, params models.ProductQueryParam) ([]models.Product, int64, error) {
	filter := bson.M{}

	if params.Search != "" {
		filter["$or"] = []bson.M{
			{"name": bson.M{"$regex": params.Search, "$options": "i"}},
			{"sku": bson.M{"$regex": params.Search, "$options": "i"}},
			{"barcode": bson.M{"$regex": params.Search, "$options": "i"}},
		}
	}

	if params.CategoryID != "" {
		if catOID, err := primitive.ObjectIDFromHex(params.CategoryID); err == nil {
			filter["category_id"] = catOID
		}
	}

	total, err := r.productColl.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	page := params.Page
	if page < 1 {
		page = 1
	}
	limit := params.Limit
	if limit < 1 || limit > 100 {
		limit = 10
	}
	skip := (page - 1) * limit

	findOptions := options.Find()
	findOptions.SetLimit(limit)
	findOptions.SetSkip(skip)
	findOptions.SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := r.productColl.Find(ctx, filter, findOptions)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var products []models.Product
	if err := cursor.All(ctx, &products); err != nil {
		return nil, 0, err
	}
	if products == nil {
		products = []models.Product{}
	}

	return products, total, nil
}

func (r *mongoProductRepository) UpdateProduct(ctx context.Context, id primitive.ObjectID, product *models.Product) error {
	product.UpdatedAt = time.Now()

	update := bson.M{
		"$set": bson.M{
			"sku":           product.SKU,
			"barcode":       product.Barcode,
			"name":          product.Name,
			"description":   product.Description,
			"category_id":   product.CategoryID,
			"category_name": product.CategoryName,
			"unit":          product.Unit,
			"min_stock":     product.MinStock,
			"price":         product.Price,
			"cost_price":    product.CostPrice,
			"image_url":     product.ImageURL,
			"variants":      product.Variants,
			"updated_at":    product.UpdatedAt,
		},
	}

	res, err := r.productColl.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrProductSKUExists
		}
		return err
	}
	if res.MatchedCount == 0 {
		return ErrProductNotFound
	}

	return nil
}

func (r *mongoProductRepository) DeleteProduct(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.productColl.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrProductNotFound
	}
	return nil
}

func (r *mongoProductRepository) CountProducts(ctx context.Context) (int64, error) {
	return r.productColl.CountDocuments(ctx, bson.M{})
}

func (r *mongoProductRepository) CreateCategory(ctx context.Context, category *models.Category) error {
	category.CreatedAt = time.Now()
	if category.ID.IsZero() {
		category.ID = primitive.NewObjectID()
	}

	_, err := r.categoryColl.InsertOne(ctx, category)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrCategoryAlreadyExist
		}
		return err
	}
	return nil
}

func (r *mongoProductRepository) FindCategoryByID(ctx context.Context, id primitive.ObjectID) (*models.Category, error) {
	var category models.Category
	err := r.categoryColl.FindOne(ctx, bson.M{"_id": id}).Decode(&category)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrCategoryNotFound
		}
		return nil, err
	}
	return &category, nil
}

func (r *mongoProductRepository) FindCategoryBySlug(ctx context.Context, slug string) (*models.Category, error) {
	var category models.Category
	err := r.categoryColl.FindOne(ctx, bson.M{"slug": slug}).Decode(&category)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrCategoryNotFound
		}
		return nil, err
	}
	return &category, nil
}

func (r *mongoProductRepository) ListCategories(ctx context.Context) ([]models.Category, error) {
	findOptions := options.Find().SetSort(bson.D{{Key: "name", Value: 1}})
	cursor, err := r.categoryColl.Find(ctx, bson.M{}, findOptions)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var categories []models.Category
	if err := cursor.All(ctx, &categories); err != nil {
		return nil, err
	}
	if categories == nil {
		categories = []models.Category{}
	}
	return categories, nil
}

func (r *mongoProductRepository) CountCategories(ctx context.Context) (int64, error) {
	return r.categoryColl.CountDocuments(ctx, bson.M{})
}
