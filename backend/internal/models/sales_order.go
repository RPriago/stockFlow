package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type SOStatus string

const (
	SOStatusDraft     SOStatus = "draft"
	SOStatusConfirmed SOStatus = "confirmed" // Stock reserved across bin locations
	SOStatusPicking   SOStatus = "picking"   // Staff picking items from bins
	SOStatusPacking   SOStatus = "packing"   // Items packed into parcel
	SOStatusShipped   SOStatus = "shipped"   // Dispatched to carrier; reserved stock deducted
	SOStatusDelivered SOStatus = "delivered" // Customer received delivery
	SOStatusCancelled SOStatus = "cancelled" // Cancelled; reserved stock released
)

type Customer struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Code      string             `bson:"code" json:"code"`
	Name      string             `bson:"name" json:"name"`
	Email     string             `bson:"email" json:"email"`
	Phone     string             `bson:"phone" json:"phone"`
	Address   string             `bson:"address" json:"address"`
	City      string             `bson:"city" json:"city"`
	IsActive  bool               `bson:"is_active" json:"is_active"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreateCustomerRequest struct {
	Code    string `json:"code"`
	Name    string `json:"name" binding:"required"`
	Email   string `json:"email"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
	City    string `json:"city"`
}

type UpdateCustomerRequest struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Address  string `json:"address"`
	City     string `json:"city"`
	IsActive *bool  `json:"is_active"`
}

type SOItem struct {
	ProductID       primitive.ObjectID `bson:"product_id" json:"product_id"`
	VariantID       string             `bson:"variant_id,omitempty" json:"variant_id,omitempty"`
	ProductName     string             `bson:"product_name" json:"product_name"`
	SKU             string             `bson:"sku" json:"sku"`
	Unit            string             `bson:"unit" json:"unit"`
	LocationID      primitive.ObjectID `bson:"location_id" json:"location_id"`
	LocationCode    string             `bson:"location_code" json:"location_code"`
	QuantityOrdered int                `bson:"quantity_ordered" json:"quantity_ordered"`
	UnitPrice       float64            `bson:"unit_price" json:"unit_price"`
	Subtotal        float64            `bson:"subtotal" json:"subtotal"`
}

type SalesOrder struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	OrderNumber     string             `bson:"order_number" json:"order_number"`
	CustomerID      primitive.ObjectID `bson:"customer_id" json:"customer_id"`
	CustomerName    string             `bson:"customer_name" json:"customer_name"`
	WarehouseID     primitive.ObjectID `bson:"warehouse_id" json:"warehouse_id"`
	WarehouseName   string             `bson:"warehouse_name" json:"warehouse_name"`
	Status          SOStatus           `bson:"status" json:"status"`
	Items           []SOItem           `bson:"items" json:"items"`
	TotalQuantity   int                `bson:"total_quantity" json:"total_quantity"`
	TotalAmount     float64            `bson:"total_amount" json:"total_amount"`
	ShippingAddress string             `bson:"shipping_address" json:"shipping_address"`
	Carrier         string             `bson:"carrier,omitempty" json:"carrier,omitempty"`
	TrackingNumber  string             `bson:"tracking_number,omitempty" json:"tracking_number,omitempty"`
	Notes           string             `bson:"notes,omitempty" json:"notes,omitempty"`
	CreatedBy       string             `bson:"created_by" json:"created_by"`
	CreatedByName   string             `bson:"created_by_name" json:"created_by_name"`
	ConfirmedAt     *time.Time         `bson:"confirmed_at,omitempty" json:"confirmed_at,omitempty"`
	ShippedAt       *time.Time         `bson:"shipped_at,omitempty" json:"shipped_at,omitempty"`
	DeliveredAt     *time.Time         `bson:"delivered_at,omitempty" json:"delivered_at,omitempty"`
	CreatedAt       time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt       time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreateSOItemRequest struct {
	ProductID       string  `json:"product_id" binding:"required"`
	VariantID       string  `json:"variant_id"`
	LocationID      string  `json:"location_id" binding:"required"`
	QuantityOrdered int     `json:"quantity_ordered" binding:"required,min=1"`
	UnitPrice       float64 `json:"unit_price" binding:"required,gte=0"`
}

type CreateSORequest struct {
	CustomerID      string                `json:"customer_id" binding:"required"`
	WarehouseID     string                `json:"warehouse_id" binding:"required"`
	ShippingAddress string                `json:"shipping_address" binding:"required"`
	Notes           string                `json:"notes"`
	Items           []CreateSOItemRequest `json:"items" binding:"required,min=1"`
}

type UpdateSORequest struct {
	ShippingAddress string                `json:"shipping_address"`
	Notes           string                `json:"notes"`
	Items           []CreateSOItemRequest `json:"items"`
}

type DispatchSORequest struct {
	Carrier        string `json:"carrier" binding:"required"`
	TrackingNumber string `json:"tracking_number" binding:"required"`
	Notes          string `json:"notes"`
}

type SOQueryParam struct {
	Status      string
	CustomerID  string
	WarehouseID string
	Search      string
	Page        int64
	Limit       int64
}

type SOStatsResponse struct {
	TotalOrders        int64   `json:"total_orders"`
	DraftOrders        int64   `json:"draft_orders"`
	PendingFulfillment int64   `json:"pending_fulfillment"` // confirmed, picking, packing
	ShippedOrders      int64   `json:"shipped_orders"`
	DeliveredOrders    int64   `json:"delivered_orders"`
	CancelledOrders    int64   `json:"cancelled_orders"`
	TotalRevenue       float64 `json:"total_revenue"`
}
