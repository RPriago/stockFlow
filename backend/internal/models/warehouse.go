package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type LocationType string

const (
	LocationTypeShelf       LocationType = "shelf"
	LocationTypePalletRack  LocationType = "pallet_rack"
	LocationTypeColdStorage LocationType = "cold_storage"
	LocationTypeStaging     LocationType = "staging_area"
)

type Warehouse struct {
	ID        primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	Code      string              `bson:"code" json:"code"`
	Name      string              `bson:"name" json:"name"`
	Address   string              `bson:"address" json:"address"`
	City      string              `bson:"city" json:"city"`
	Capacity  int                 `bson:"capacity" json:"capacity"` // Total max items / pallets
	IsActive  bool                `bson:"is_active" json:"is_active"`
	ManagerID *primitive.ObjectID `bson:"manager_id,omitempty" json:"manager_id,omitempty"`
	TotalBins int                 `bson:"-" json:"total_bins,omitempty"`
	CreatedAt time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time           `bson:"updated_at" json:"updated_at"`
}

type CreateWarehouseRequest struct {
	Code     string `json:"code"` // If empty, auto-generated from city/name
	Name     string `json:"name" binding:"required,min=2,max=100"`
	Address  string `json:"address" binding:"required"`
	City     string `json:"city" binding:"required"`
	Capacity int    `json:"capacity" binding:"required,min=1"`
}

type UpdateWarehouseRequest struct {
	Code     string `json:"code"`
	Name     string `json:"name" binding:"required,min=2,max=100"`
	Address  string `json:"address" binding:"required"`
	City     string `json:"city" binding:"required"`
	Capacity int    `json:"capacity" binding:"required,min=1"`
	IsActive bool   `json:"is_active"`
}

type Location struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WarehouseID primitive.ObjectID `bson:"warehouse_id" json:"warehouse_id"`
	Code        string             `bson:"code" json:"code"` // e.g. "A-01-02-B"
	Zone        string             `bson:"zone" json:"zone"` // e.g. "Zone A"
	Rack        string             `bson:"rack" json:"rack"` // e.g. "01"
	Shelf       string             `bson:"shelf" json:"shelf"` // e.g. "02"
	Bin         string             `bson:"bin" json:"bin"` // e.g. "B"
	Type        LocationType       `bson:"type" json:"type"`
	MaxCapacity int                `bson:"max_capacity" json:"max_capacity"`
	IsActive    bool               `bson:"is_active" json:"is_active"`
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
}

type CreateLocationRequest struct {
	Zone        string       `json:"zone" binding:"required"`
	Rack        string       `json:"rack" binding:"required"`
	Shelf       string       `json:"shelf" binding:"required"`
	Bin         string       `json:"bin" binding:"required"`
	Type        LocationType `json:"type" binding:"required"`
	MaxCapacity int          `json:"max_capacity" binding:"required,min=1"`
}
