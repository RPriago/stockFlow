package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
)

type ProductService interface {
	CreateProduct(ctx context.Context, req models.CreateProductRequest, createdBy string) (*models.Product, error)
	GetProductByID(ctx context.Context, id primitive.ObjectID) (*models.Product, error)
	ListProducts(ctx context.Context, params models.ProductQueryParam) ([]models.Product, int64, error)
	UpdateProduct(ctx context.Context, id primitive.ObjectID, req models.UpdateProductRequest) (*models.Product, error)
	DeleteProduct(ctx context.Context, id primitive.ObjectID) error

	CreateCategory(ctx context.Context, req models.CreateCategoryRequest) (*models.Category, error)
	ListCategories(ctx context.Context) ([]models.Category, error)
	SeedInitialCatalog(ctx context.Context) error
}

type productService struct {
	productRepo repository.ProductRepository
}

func NewProductService(productRepo repository.ProductRepository) ProductService {
	return &productService{
		productRepo: productRepo,
	}
}

func (s *productService) CreateProduct(ctx context.Context, req models.CreateProductRequest, createdBy string) (*models.Product, error) {
	catOID, err := primitive.ObjectIDFromHex(req.CategoryID)
	if err != nil {
		return nil, errors.New("invalid category_id format")
	}

	category, err := s.productRepo.FindCategoryByID(ctx, catOID)
	if err != nil {
		return nil, errors.New("selected category does not exist")
	}

	if req.Price <= 0 {
		return nil, errors.New("selling price must be greater than 0")
	}
	if req.CostPrice < 0 {
		return nil, errors.New("cost price cannot be negative")
	}
	for i, v := range req.Variants {
		if v.Price <= 0 {
			return nil, fmt.Errorf("variant %d (%s) price must be greater than 0", i+1, v.Name)
		}
	}

	// Auto-generate SKU if not provided
	sku := strings.TrimSpace(req.SKU)
	if sku == "" {
		prefix := "PRD"
		if len(category.Slug) >= 3 {
			prefix = strings.ToUpper(category.Slug[:3])
		}
		randomBytes := make([]byte, 3)
		_, _ = rand.Read(randomBytes)
		sku = fmt.Sprintf("%s-%s", prefix, strings.ToUpper(hex.EncodeToString(randomBytes)))
	}

	// Verify SKU uniqueness
	if _, err := s.productRepo.FindProductBySKU(ctx, sku); err == nil {
		return nil, repository.ErrProductSKUExists
	}

	// Auto-generate Barcode if empty
	barcode := strings.TrimSpace(req.Barcode)
	if barcode == "" {
		randomBytes := make([]byte, 6)
		_, _ = rand.Read(randomBytes)
		barcode = fmt.Sprintf("899%s", hex.EncodeToString(randomBytes)[:9])
	}

	// Process Variants
	variants := make([]models.ProductVariant, len(req.Variants))
	for i, v := range req.Variants {
		varSKU := strings.TrimSpace(v.SKU)
		if varSKU == "" {
			varSKU = fmt.Sprintf("%s-V%d", sku, i+1)
		}
		price := v.Price
		if price == 0 {
			price = req.Price
		}
		costPrice := v.CostPrice
		if costPrice == 0 {
			costPrice = req.CostPrice
		}
		minStock := v.MinStock
		if minStock == 0 {
			minStock = req.MinStock
		}

		variants[i] = models.ProductVariant{
			ID:         primitive.NewObjectID().Hex(),
			SKU:        varSKU,
			Name:       v.Name,
			Attributes: v.Attributes,
			Price:      price,
			CostPrice:  costPrice,
			MinStock:   minStock,
		}
	}

	product := &models.Product{
		SKU:          sku,
		Barcode:      barcode,
		Name:         req.Name,
		Description:  req.Description,
		CategoryID:   catOID,
		CategoryName: category.Name,
		Unit:         req.Unit,
		MinStock:     req.MinStock,
		Price:        req.Price,
		CostPrice:    req.CostPrice,
		ImageURL:     req.ImageURL,
		Variants:     variants,
		CreatedBy:    createdBy,
	}

	if err := s.productRepo.CreateProduct(ctx, product); err != nil {
		return nil, err
	}

	return product, nil
}

func (s *productService) GetProductByID(ctx context.Context, id primitive.ObjectID) (*models.Product, error) {
	return s.productRepo.FindProductByID(ctx, id)
}

func (s *productService) ListProducts(ctx context.Context, params models.ProductQueryParam) ([]models.Product, int64, error) {
	return s.productRepo.FindProducts(ctx, params)
}

func (s *productService) UpdateProduct(ctx context.Context, id primitive.ObjectID, req models.UpdateProductRequest) (*models.Product, error) {
	existing, err := s.productRepo.FindProductByID(ctx, id)
	if err != nil {
		return nil, err
	}

	catOID, err := primitive.ObjectIDFromHex(req.CategoryID)
	if err != nil {
		return nil, errors.New("invalid category_id format")
	}

	category, err := s.productRepo.FindCategoryByID(ctx, catOID)
	if err != nil {
		return nil, errors.New("selected category does not exist")
	}

	if req.Price <= 0 {
		return nil, errors.New("selling price must be greater than 0")
	}
	if req.CostPrice < 0 {
		return nil, errors.New("cost price cannot be negative")
	}
	for i, v := range req.Variants {
		if v.Price <= 0 {
			return nil, fmt.Errorf("variant %d (%s) price must be greater than 0", i+1, v.Name)
		}
	}

	sku := strings.TrimSpace(req.SKU)
	if sku == "" {
		sku = existing.SKU
	}

	variants := make([]models.ProductVariant, len(req.Variants))
	for i, v := range req.Variants {
		varSKU := strings.TrimSpace(v.SKU)
		if varSKU == "" {
			varSKU = fmt.Sprintf("%s-V%d", sku, i+1)
		}
		variants[i] = models.ProductVariant{
			ID:         primitive.NewObjectID().Hex(),
			SKU:        varSKU,
			Name:       v.Name,
			Attributes: v.Attributes,
			Price:      v.Price,
			CostPrice:  v.CostPrice,
			MinStock:   v.MinStock,
		}
	}

	existing.SKU = sku
	existing.Barcode = req.Barcode
	existing.Name = req.Name
	existing.Description = req.Description
	existing.CategoryID = catOID
	existing.CategoryName = category.Name
	existing.Unit = req.Unit
	existing.MinStock = req.MinStock
	existing.Price = req.Price
	existing.CostPrice = req.CostPrice
	existing.ImageURL = req.ImageURL
	existing.Variants = variants

	if err := s.productRepo.UpdateProduct(ctx, id, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

func (s *productService) DeleteProduct(ctx context.Context, id primitive.ObjectID) error {
	return s.productRepo.DeleteProduct(ctx, id)
}

func (s *productService) CreateCategory(ctx context.Context, req models.CreateCategoryRequest) (*models.Category, error) {
	slug := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(req.Name), " ", "-"))

	category := &models.Category{
		Name:        req.Name,
		Slug:        slug,
		Description: req.Description,
	}

	if err := s.productRepo.CreateCategory(ctx, category); err != nil {
		return nil, err
	}

	return category, nil
}

func (s *productService) ListCategories(ctx context.Context) ([]models.Category, error) {
	return s.productRepo.ListCategories(ctx)
}

func (s *productService) SeedInitialCatalog(ctx context.Context) error {
	count, err := s.productRepo.CountProducts(ctx)
	if err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	log.Println("Seeding initial Product Catalog & Categories...")

	// 1. Seed Categories
	categoriesData := []struct {
		Name string
		Desc string
	}{
		{"Industrial Tools", "Power tools, hand tools, and workshop machinery"},
		{"Safety Equipment", "Personal protective equipment (PPE), helmets, and gloves"},
		{"Packaging Materials", "Boxes, tape, stretch film, and bubble wrap"},
		{"Raw Materials", "Bulk plastics, metals, fasteners, and hardware"},
	}

	createdCategories := make(map[string]primitive.ObjectID)

	for _, c := range categoriesData {
		cat, err := s.CreateCategory(ctx, models.CreateCategoryRequest{
			Name:        c.Name,
			Description: c.Desc,
		})
		if err == nil && cat != nil {
			createdCategories[c.Name] = cat.ID
		} else {
			// Might already exist
			existingList, _ := s.productRepo.ListCategories(ctx)
			for _, ex := range existingList {
				createdCategories[ex.Name] = ex.ID
			}
		}
	}

	// 2. Seed Sample Products
	toolsCatID := createdCategories["Industrial Tools"]
	safetyCatID := createdCategories["Safety Equipment"]
	packCatID := createdCategories["Packaging Materials"]

	sampleProducts := []models.CreateProductRequest{
		{
			SKU:         "TOOL-DRL-001",
			Barcode:     "899100234501",
			Name:        "Brushless Cordless Drill 20V",
			Description: "High-torque heavy duty cordless drill with brushless motor for industrial use.",
			CategoryID:  toolsCatID.Hex(),
			Unit:        "pcs",
			MinStock:    15,
			Price:       1250000,
			CostPrice:   850000,
			ImageURL:    "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&auto=format&fit=crop&q=60",
			Variants: []models.CreateProductVariantRequest{
				{
					Name:       "Standard Kit (1 Battery)",
					SKU:        "TOOL-DRL-001-1B",
					Price:      1250000,
					CostPrice:  850000,
					MinStock:   10,
					Attributes: map[string]string{"battery": "1x 2.0Ah"},
				},
				{
					Name:       "Pro Kit (2 Batteries + Case)",
					SKU:        "TOOL-DRL-001-2B",
					Price:      1750000,
					CostPrice:  1200000,
					MinStock:   5,
					Attributes: map[string]string{"battery": "2x 4.0Ah", "case": "Hard case"},
				},
			},
		},
		{
			SKU:         "SAFE-BOT-002",
			Barcode:     "899100234502",
			Name:        "Steel-Toe Leather Safety Boots",
			Description: "Oil-resistant, anti-puncture steel toe work boots complying with ISO safety standards.",
			CategoryID:  safetyCatID.Hex(),
			Unit:        "pair",
			MinStock:    20,
			Price:       450000,
			CostPrice:   280000,
			ImageURL:    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=60",
			Variants: []models.CreateProductVariantRequest{
				{
					Name:       "Size 41",
					SKU:        "SAFE-BOT-002-41",
					Price:      450000,
					CostPrice:  280000,
					MinStock:   8,
					Attributes: map[string]string{"size": "41"},
				},
				{
					Name:       "Size 42",
					SKU:        "SAFE-BOT-002-42",
					Price:      450000,
					CostPrice:  280000,
					MinStock:   8,
					Attributes: map[string]string{"size": "42"},
				},
				{
					Name:       "Size 43",
					SKU:        "SAFE-BOT-002-43",
					Price:      450000,
					CostPrice:  280000,
					MinStock:   6,
					Attributes: map[string]string{"size": "43"},
				},
			},
		},
		{
			SKU:         "PACK-BOX-003",
			Barcode:     "899100234503",
			Name:        "Corrugated Shipping Box 40x30x20cm",
			Description: "Double-wall heavy duty carton boxes for secure transit and pallet stacking.",
			CategoryID:  packCatID.Hex(),
			Unit:        "bundle",
			MinStock:    50,
			Price:       120000,
			CostPrice:   75000,
			ImageURL:    "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=500&auto=format&fit=crop&q=60",
			Variants:    []models.CreateProductVariantRequest{},
		},
	}

	for _, p := range sampleProducts {
		if p.CategoryID != "" {
			_, err := s.CreateProduct(ctx, p, "system_seeder")
			if err != nil {
				log.Printf("Note seeding product %s: %v\n", p.Name, err)
			}
		}
	}

	log.Println("Product catalog successfully seeded.")
	return nil
}
