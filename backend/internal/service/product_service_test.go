package service

import (
	"context"
	"testing"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
)

func TestProductServiceCRUD(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewProductMemoryRepository()
	svc := NewProductService(repo)

	// 1. Create Category
	cat, err := svc.CreateCategory(ctx, models.CreateCategoryRequest{
		Name:        "Electronics",
		Description: "Electronic devices and accessories",
	})
	if err != nil {
		t.Fatalf("Failed to create category: %v", err)
	}
	if cat.ID.IsZero() {
		t.Fatalf("Expected category ID to be set")
	}

	// 2. Create Product with auto-generated SKU
	prodReq := models.CreateProductRequest{
		Name:        "Wireless Barcode Scanner",
		Description: "Handheld Bluetooth 2D barcode scanner",
		CategoryID:  cat.ID.Hex(),
		Unit:        "pcs",
		MinStock:    10,
		Price:       650000,
		CostPrice:   420000,
		Variants: []models.CreateProductVariantRequest{
			{
				Name:       "Bluetooth Standard",
				Attributes: map[string]string{"type": "BT 5.0"},
				Price:      650000,
			},
		},
	}

	prod, err := svc.CreateProduct(ctx, prodReq, "test_admin")
	if err != nil {
		t.Fatalf("Failed to create product: %v", err)
	}

	if prod.SKU == "" {
		t.Errorf("Expected auto-generated SKU, got empty")
	}
	if prod.Barcode == "" {
		t.Errorf("Expected auto-generated Barcode, got empty")
	}
	if len(prod.Variants) != 1 {
		t.Fatalf("Expected 1 variant, got %d", len(prod.Variants))
	}
	if prod.Variants[0].SKU == "" {
		t.Errorf("Expected variant SKU to be auto-generated")
	}

	// 3. Test duplicate SKU rejection
	duplicateReq := prodReq
	duplicateReq.SKU = prod.SKU
	_, err = svc.CreateProduct(ctx, duplicateReq, "test_admin")
	if err == nil {
		t.Errorf("Expected error when creating product with duplicate SKU, got nil")
	}

	// 4. Test List Products with Search
	products, total, err := svc.ListProducts(ctx, models.ProductQueryParam{
		Search: "Scanner",
		Page:   1,
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("ListProducts failed: %v", err)
	}
	if total != 1 || len(products) != 1 {
		t.Errorf("Expected 1 product found with search 'Scanner', got total=%d len=%d", total, len(products))
	}

	// 5. Test Update Product
	updateReq := models.UpdateProductRequest{
		SKU:         prod.SKU,
		Barcode:     prod.Barcode,
		Name:        "Wireless Barcode Scanner V2",
		Description: "Updated description",
		CategoryID:  cat.ID.Hex(),
		Unit:        "pcs",
		MinStock:    15,
		Price:       700000,
		CostPrice:   450000,
		Variants:    []models.CreateProductVariantRequest{},
	}
	updated, err := svc.UpdateProduct(ctx, prod.ID, updateReq)
	if err != nil {
		t.Fatalf("UpdateProduct failed: %v", err)
	}
	if updated.Name != "Wireless Barcode Scanner V2" {
		t.Errorf("Expected updated name, got %s", updated.Name)
	}
	if updated.MinStock != 15 {
		t.Errorf("Expected MinStock=15, got %d", updated.MinStock)
	}

	// 6. Test Delete Product
	err = svc.DeleteProduct(ctx, prod.ID)
	if err != nil {
		t.Fatalf("DeleteProduct failed: %v", err)
	}

	_, err = svc.GetProductByID(ctx, prod.ID)
	if err == nil {
		t.Errorf("Expected ErrProductNotFound after deletion, got nil")
	}
}
