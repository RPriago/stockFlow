package repository

import (
	"context"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
)

type productMemoryRepository struct {
	mu         sync.RWMutex
	products   map[primitive.ObjectID]*models.Product
	categories map[primitive.ObjectID]*models.Category
}

func NewProductMemoryRepository() ProductRepository {
	return &productMemoryRepository{
		products:   make(map[primitive.ObjectID]*models.Product),
		categories: make(map[primitive.ObjectID]*models.Category),
	}
}

func (r *productMemoryRepository) CreateProduct(ctx context.Context, product *models.Product) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// SKU uniqueness check
	for _, p := range r.products {
		if strings.EqualFold(p.SKU, product.SKU) {
		if !p.IsDeleted && strings.EqualFold(p.SKU, product.SKU) {
			return ErrProductSKUExists
		}
	}

	now := time.Now()
	product.CreatedAt = now
	product.UpdatedAt = now
	if product.ID.IsZero() {
		product.ID = primitive.NewObjectID()
	}

	copied := *product
	r.products[product.ID] = &copied
	return nil
}

func (r *productMemoryRepository) FindProductByID(ctx context.Context, id primitive.ObjectID) (*models.Product, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	p, exists := r.products[id]
	if !exists {
	if !exists || p.IsDeleted {
		return nil, ErrProductNotFound
	}
	copied := *p
	return &copied, nil
}

func (r *productMemoryRepository) FindProductBySKU(ctx context.Context, sku string) (*models.Product, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, p := range r.products {
		if strings.EqualFold(p.SKU, sku) {
		if !p.IsDeleted && strings.EqualFold(p.SKU, sku) {
			copied := *p
			return &copied, nil
		}
	}
	return nil, ErrProductNotFound
}

func (r *productMemoryRepository) FindProducts(ctx context.Context, params models.ProductQueryParam) ([]models.Product, int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var filtered []models.Product
	searchLower := strings.ToLower(params.Search)

	for _, p := range r.products {
		if !params.IncludeDeleted && p.IsDeleted {
			continue
		}

		// Category filter
		if params.CategoryID != "" && p.CategoryID.Hex() != params.CategoryID {
			continue
		}

		// Search filter (name, sku, barcode)
		if params.Search != "" {
			nameMatch := strings.Contains(strings.ToLower(p.Name), searchLower)
			skuMatch := strings.Contains(strings.ToLower(p.SKU), searchLower)
			barcodeMatch := strings.Contains(strings.ToLower(p.Barcode), searchLower)
			if !nameMatch && !skuMatch && !barcodeMatch {
				continue
			}
		}

		filtered = append(filtered, *p)
	}

	total := int64(len(filtered))

	page := params.Page
	if page < 1 {
		page = 1
	}
	limit := params.Limit
	if limit < 1 || limit > 100 {
	if limit < 1 {
		limit = 10
	} else if limit > 500 {
		limit = 500
	}
	skip := (page - 1) * limit

	if skip >= total {
		return []models.Product{}, total, nil
	}

	end := skip + limit
	if end > total {
		end = total
	}

	return filtered[skip:end], total, nil
}

func (r *productMemoryRepository) UpdateProduct(ctx context.Context, id primitive.ObjectID, product *models.Product) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.products[id]
	if !exists {
		return ErrProductNotFound
	}

	// Check SKU uniqueness if changed
	for otherID, p := range r.products {
		if otherID != id && strings.EqualFold(p.SKU, product.SKU) {
		if otherID != id && !p.IsDeleted && strings.EqualFold(p.SKU, product.SKU) {
			return ErrProductSKUExists
		}
	}

	product.ID = id
	product.CreatedAt = existing.CreatedAt
	product.UpdatedAt = time.Now()
	copied := *product
	r.products[id] = &copied

	return nil
}

func (r *productMemoryRepository) DeleteProduct(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.products[id]; !exists {
	p, exists := r.products[id]
	if !exists {
		return ErrProductNotFound
	}
	delete(r.products, id)
	now := time.Now()
	p.IsDeleted = true
	p.DeletedAt = &now
	return nil
}

func (r *productMemoryRepository) CountProducts(ctx context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return int64(len(r.products)), nil
	var count int64
	for _, p := range r.products {
		if !p.IsDeleted {
			count++
		}
	}
	return count, nil
}

func (r *productMemoryRepository) CreateCategory(ctx context.Context, category *models.Category) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, c := range r.categories {
		if strings.EqualFold(c.Name, category.Name) || (category.Slug != "" && c.Slug == category.Slug) {
			return ErrCategoryAlreadyExist
		}
	}

	category.CreatedAt = time.Now()
	if category.ID.IsZero() {
		category.ID = primitive.NewObjectID()
	}

	copied := *category
	r.categories[category.ID] = &copied
	return nil
}

func (r *productMemoryRepository) FindCategoryByID(ctx context.Context, id primitive.ObjectID) (*models.Category, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	c, exists := r.categories[id]
	if !exists {
		return nil, ErrCategoryNotFound
	}
	copied := *c
	return &copied, nil
}

func (r *productMemoryRepository) FindCategoryBySlug(ctx context.Context, slug string) (*models.Category, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, c := range r.categories {
		if c.Slug == slug {
			copied := *c
			return &copied, nil
		}
	}
	return nil, ErrCategoryNotFound
}

func (r *productMemoryRepository) ListCategories(ctx context.Context) ([]models.Category, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	res := make([]models.Category, 0, len(r.categories))
	for _, c := range r.categories {
		res = append(res, *c)
	}
	return res, nil
}

func (r *productMemoryRepository) CountCategories(ctx context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return int64(len(r.categories)), nil
}
