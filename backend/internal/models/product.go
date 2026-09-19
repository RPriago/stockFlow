package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Category struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name        string             `bson:"name" json:"name"`
	Slug        string             `bson:"slug" json:"slug"`
	Description string             `bson:"description" json:"description"`
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
}

type CreateCategoryRequest struct {
	Name        string `json:"name" binding:"required,min=2,max=50"`
	Description string `json:"description"`
}

type ProductVariant struct {
	ID         string            `bson:"id" json:"id"`
	SKU        string            `bson:"sku" json:"sku"`
	Name       string            `bson:"name" json:"name"`
	Attributes map[string]string `bson:"attributes" json:"attributes"` // e.g. {"size": "XL", "color": "Red"}
	Price      float64           `bson:"price" json:"price"`
	CostPrice  float64           `bson:"cost_price" json:"cost_price"`
	MinStock   int               `bson:"min_stock" json:"min_stock"`
}

type CreateProductVariantRequest struct {
	SKU        string            `json:"sku"`
	Name       string            `json:"name" binding:"required"`
	Attributes map[string]string `json:"attributes"`
	Price      float64           `json:"price"`
	CostPrice  float64           `json:"cost_price"`
	MinStock   int               `json:"min_stock"`
}

type Product struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	SKU          string             `bson:"sku" json:"sku"`
	Barcode      string             `bson:"barcode" json:"barcode"`
	Name         string             `bson:"name" json:"name"`
	Description  string             `bson:"description" json:"description"`
	CategoryID   primitive.ObjectID `bson:"category_id" json:"category_id"`
	CategoryName string             `bson:"category_name" json:"category_name"`
	Unit         string             `bson:"unit" json:"unit"` // pcs, box, kg, meter, etc.
	MinStock     int                `bson:"min_stock" json:"min_stock"`
	Price        float64            `bson:"price" json:"price"`
	CostPrice    float64            `bson:"cost_price" json:"cost_price"`
	ImageURL     string             `bson:"image_url" json:"image_url"`
	Variants     []ProductVariant   `bson:"variants" json:"variants"`
	CreatedBy    string             `bson:"created_by" json:"created_by"`
	CreatedAt    time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreateProductRequest struct {
	SKU         string                        `json:"sku"` // If empty, will be auto-generated
	Barcode     string                        `json:"barcode"`
	Name        string                        `json:"name" binding:"required,min=2,max=150"`
	Description string                        `json:"description"`
	CategoryID  string                        `json:"category_id" binding:"required"`
	Unit        string                        `json:"unit" binding:"required"`
	MinStock    int                           `json:"min_stock"`
	Price       float64                       `json:"price"`
	CostPrice   float64                       `json:"cost_price"`
	ImageURL    string                        `json:"image_url"`
	Variants    []CreateProductVariantRequest `json:"variants"`
}

type UpdateProductRequest struct {
	SKU         string                        `json:"sku"`
	Barcode     string                        `json:"barcode"`
	Name        string                        `json:"name" binding:"required,min=2,max=150"`
	Description string                        `json:"description"`
	CategoryID  string                        `json:"category_id" binding:"required"`
	Unit        string                        `json:"unit" binding:"required"`
	MinStock    int                           `json:"min_stock"`
	Price       float64                       `json:"price"`
	CostPrice   float64                       `json:"cost_price"`
	ImageURL    string                        `json:"image_url"`
	Variants    []CreateProductVariantRequest `json:"variants"`
}

type ProductQueryParam struct {
	Search       string
	CategoryID   string
	LowStockOnly bool
	Page         int64
	Limit        int64
}

type ProductListResponse struct {
	Products []Product `json:"products"`
	Meta     struct {
		Total int64 `json:"total"`
		Page  int64 `json:"page"`
		Limit int64 `json:"limit"`
	} `json:"meta"`
}
