package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type POStatus string

const (
	POStatusDraft             POStatus = "draft"
	POStatusOrdered           POStatus = "ordered"
	POStatusPartiallyReceived POStatus = "partially_received"
	POStatusReceived          POStatus = "received"
	POStatusCancelled         POStatus = "cancelled"
)

// Supplier represents an external vendor or partner
type Supplier struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Code          string             `bson:"code" json:"code"` // e.g. "SUP-001"
	Name          string             `bson:"name" json:"name"`
	Email         string             `bson:"email" json:"email"`
	Phone         string             `bson:"phone" json:"phone"`
	Address       string             `bson:"address" json:"address"`
	ContactPerson string             `bson:"contact_person" json:"contact_person"`
	IsActive      bool               `bson:"is_active" json:"is_active"`
	CreatedAt     time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreateSupplierRequest struct {
	Code          string `json:"code"`
	Name          string `json:"name" binding:"required,min=2,max=100"`
	Email         string `json:"email" binding:"omitempty,email"`
	Phone         string `json:"phone"`
	Address       string `json:"address"`
	ContactPerson string `json:"contact_person"`
}

type UpdateSupplierRequest struct {
	Code          string `json:"code"`
	Name          string `json:"name" binding:"required,min=2,max=100"`
	Email         string `json:"email" binding:"omitempty,email"`
	Phone         string `json:"phone"`
	Address       string `json:"address"`
	ContactPerson string `json:"contact_person"`
	IsActive      bool   `json:"is_active"`
}

// POItem represents an individual product line item inside a Purchase Order
type POItem struct {
	ProductID        primitive.ObjectID  `bson:"product_id" json:"product_id"`
	VariantID        string              `bson:"variant_id,omitempty" json:"variant_id,omitempty"`
	ProductName      string              `bson:"product_name" json:"product_name"`
	SKU              string              `bson:"sku" json:"sku"`
	Unit             string              `bson:"unit" json:"unit"`
	QuantityOrdered  int                 `bson:"quantity_ordered" json:"quantity_ordered"`
	QuantityReceived int                 `bson:"quantity_received" json:"quantity_received"`
	UnitCost         float64             `bson:"unit_cost" json:"unit_cost"`
	Subtotal         float64             `bson:"subtotal" json:"subtotal"`
	TargetLocationID *primitive.ObjectID `bson:"target_location_id,omitempty" json:"target_location_id,omitempty"`
}

type CreatePOItemRequest struct {
	ProductID        string  `json:"product_id" binding:"required"`
	VariantID        string  `json:"variant_id"`
	QuantityOrdered  int     `json:"quantity_ordered" binding:"required,min=1"`
	UnitCost         float64 `json:"unit_cost" binding:"min=0"`
	TargetLocationID string  `json:"target_location_id"`
}

// PurchaseOrder represents a procurement order placed with a supplier
type PurchaseOrder struct {
	ID                    primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	OrderNumber           string             `bson:"order_number" json:"order_number"` // e.g. "PO-2026-001"
	SupplierID            primitive.ObjectID `bson:"supplier_id" json:"supplier_id"`
	SupplierName          string             `bson:"supplier_name" json:"supplier_name"`
	WarehouseID           primitive.ObjectID `bson:"warehouse_id" json:"warehouse_id"`
	WarehouseName         string             `bson:"warehouse_name" json:"warehouse_name"`
	Status                POStatus           `bson:"status" json:"status"`
	Items                 []POItem           `bson:"items" json:"items"`
	TotalQuantityOrdered  int                `bson:"total_quantity_ordered" json:"total_quantity_ordered"`
	TotalQuantityReceived int                `bson:"total_quantity_received" json:"total_quantity_received"`
	TotalAmount           float64            `bson:"total_amount" json:"total_amount"`
	ExpectedDate          *time.Time         `bson:"expected_date,omitempty" json:"expected_date,omitempty"`
	Notes                 string             `bson:"notes,omitempty" json:"notes,omitempty"`
	CreatedBy             string             `bson:"created_by" json:"created_by"`
	CreatedByName         string             `bson:"created_by_name" json:"created_by_name"`
	CreatedAt             time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt             time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreatePORequest struct {
	SupplierID   string                `json:"supplier_id" binding:"required"`
	WarehouseID  string                `json:"warehouse_id" binding:"required"`
	Items        []CreatePOItemRequest `json:"items" binding:"required,min=1"`
	ExpectedDate *time.Time            `json:"expected_date"`
	Notes        string                `json:"notes"`
}

type UpdatePORequest struct {
	SupplierID   string                `json:"supplier_id" binding:"required"`
	WarehouseID  string                `json:"warehouse_id" binding:"required"`
	Items        []CreatePOItemRequest `json:"items" binding:"required,min=1"`
	ExpectedDate *time.Time            `json:"expected_date"`
	Notes        string                `json:"notes"`
}

// ReceiveItemPayload contains details for receiving a specific item into a designated bin
type ReceiveItemPayload struct {
	ProductID        string `json:"product_id" binding:"required"`
	VariantID        string `json:"variant_id"`
	LocationID       string `json:"location_id" binding:"required"`
	QuantityReceived int    `json:"quantity_received" binding:"required,min=1"`
}

type ReceivePORequest struct {
	Items []ReceiveItemPayload `json:"items" binding:"required,min=1"`
	Notes string               `json:"notes"`
}

type POQueryParam struct {
	Status      string
	SupplierID  string
	WarehouseID string
	Search      string
	Page        int64
	Limit       int64
}

type POStatsResponse struct {
	TotalOrders       int64   `json:"total_orders"`
	DraftOrders       int64   `json:"draft_orders"`
	PendingOrders     int64   `json:"pending_orders"` // ordered + partially_received
	CompletedOrders   int64   `json:"completed_orders"`
	CancelledOrders   int64   `json:"cancelled_orders"`
	TotalProcurement  float64 `json:"total_procurement_value"`
}
