package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type MovementType string

const (
	MovementTypeStockIn    MovementType = "stock_in"
	MovementTypeStockOut   MovementType = "stock_out"
	MovementTypeAdjustment MovementType = "adjustment"
	MovementTypeReserve    MovementType = "reserve"
	MovementTypeRelease    MovementType = "release"
)

type InventoryItem struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ProductID   primitive.ObjectID `bson:"product_id" json:"product_id"`
	VariantID   string             `bson:"variant_id,omitempty" json:"variant_id,omitempty"`
	WarehouseID primitive.ObjectID `bson:"warehouse_id" json:"warehouse_id"`
	LocationID  primitive.ObjectID `bson:"location_id" json:"location_id"`

	// Denormalized fields for quick presentation and filtering
	ProductName   string `bson:"product_name" json:"product_name"`
	SKU           string `bson:"sku" json:"sku"`
	WarehouseName string `bson:"warehouse_name" json:"warehouse_name"`
	LocationCode  string `bson:"location_code" json:"location_code"`

	QuantityOnHand    int       `bson:"quantity_on_hand" json:"quantity_on_hand"`
	QuantityReserved  int       `bson:"quantity_reserved" json:"quantity_reserved"`
	QuantityAvailable int       `bson:"quantity_available" json:"quantity_available"`
	MinStock          int       `bson:"min_stock" json:"min_stock"`
	Unit              string    `bson:"unit" json:"unit"`
	UpdatedAt         time.Time `bson:"updated_at" json:"updated_at"`
}

type InventoryMovement struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ItemID      primitive.ObjectID `bson:"item_id" json:"item_id"`
	ProductID   primitive.ObjectID `bson:"product_id" json:"product_id"`
	VariantID   string             `bson:"variant_id,omitempty" json:"variant_id,omitempty"`
	WarehouseID primitive.ObjectID `bson:"warehouse_id" json:"warehouse_id"`
	LocationID  primitive.ObjectID `bson:"location_id" json:"location_id"`

	ProductName   string `bson:"product_name" json:"product_name"`
	SKU           string `bson:"sku" json:"sku"`
	WarehouseName string `bson:"warehouse_name" json:"warehouse_name"`
	LocationCode  string `bson:"location_code" json:"location_code"`

	MovementType  MovementType `bson:"movement_type" json:"movement_type"`
	Quantity      int          `bson:"quantity" json:"quantity"` // positive for in/up, negative for out/down
	BalanceBefore int          `bson:"balance_before" json:"balance_before"`
	BalanceAfter  int          `bson:"balance_after" json:"balance_after"`

	ReferenceType string `bson:"reference_type,omitempty" json:"reference_type,omitempty"`
	ReferenceID   string `bson:"reference_id,omitempty" json:"reference_id,omitempty"`
	Notes         string `bson:"notes,omitempty" json:"notes,omitempty"`

	CreatedBy     string    `bson:"created_by" json:"created_by"`
	CreatedByName string    `bson:"created_by_name" json:"created_by_name"`
	CreatedAt     time.Time `bson:"created_at" json:"created_at"`
}

type StockInRequest struct {
	ProductID     string `json:"product_id" binding:"required"`
	VariantID     string `json:"variant_id"`
	WarehouseID   string `json:"warehouse_id" binding:"required"`
	LocationID    string `json:"location_id" binding:"required"`
	Quantity      int    `json:"quantity" binding:"required,min=1"`
	ReferenceType string `json:"reference_type"`
	ReferenceID   string `json:"reference_id"`
	Notes         string `json:"notes"`
}

type StockOutRequest struct {
	ProductID     string `json:"product_id" binding:"required"`
	VariantID     string `json:"variant_id"`
	WarehouseID   string `json:"warehouse_id" binding:"required"`
	LocationID    string `json:"location_id" binding:"required"`
	Quantity      int    `json:"quantity" binding:"required,min=1"`
	ReferenceType string `json:"reference_type"`
	ReferenceID   string `json:"reference_id"`
	Notes         string `json:"notes"`
}

type StockAdjustmentRequest struct {
	ProductID      string `json:"product_id" binding:"required"`
	VariantID      string `json:"variant_id"`
	WarehouseID    string `json:"warehouse_id" binding:"required"`
	LocationID     string `json:"location_id" binding:"required"`
	ActualQuantity int    `json:"actual_quantity" binding:"min=0"`
	Reason         string `json:"reason" binding:"required"`
	Notes          string `json:"notes"`
}

type InventoryQueryParam struct {
	WarehouseID  string
	LocationID   string
	ProductID    string
	LowStockOnly bool
	Search       string
	Page         int64
	Limit        int64
}

type MovementQueryParam struct {
	WarehouseID  string
	ProductID    string
	MovementType string
	Page         int64
	Limit        int64
}

type InventoryStatsResponse struct {
	TotalOnHand        int   `json:"total_on_hand"`
	TotalAvailable     int   `json:"total_available"`
	TotalReserved      int   `json:"total_reserved"`
	TotalItemsCount    int64 `json:"total_items_count"`
	LowStockItemsCount int64 `json:"low_stock_items_count"`
	MovementsToday     int64 `json:"movements_today"`
}

type StockFlowPoint struct {
	Label    string `json:"label"`
	Inbound  int    `json:"inbound"`
	Outbound int    `json:"outbound"`
	Date     string `json:"date,omitempty"`
}

type StockFlowResponse struct {
	Points        []StockFlowPoint `json:"points"`
	TotalInbound  int              `json:"total_inbound"`
	TotalOutbound int              `json:"total_outbound"`
}

type WarehouseCapacityItem struct {
	WarehouseID  string  `json:"warehouse_id"`
	Name         string  `json:"name"`
	CurrentStock int     `json:"current_stock"`
	Capacity     int     `json:"capacity"`
	Percentage   float64 `json:"percentage"`
}

type WarehouseCapacityResponse struct {
	Warehouses      []WarehouseCapacityItem `json:"warehouses"`
	TotalCapacity   int                     `json:"total_capacity"`
	TotalOnHand     int                     `json:"total_on_hand"`
	UtilizationRate float64                 `json:"utilization_rate"`
}
