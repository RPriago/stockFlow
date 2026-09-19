package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Role string

const (
	RoleSuperAdmin       Role = "super_admin"
	RoleWarehouseManager Role = "warehouse_manager"
	RoleWarehouseStaff   Role = "warehouse_staff"
)

func IsValidRole(r Role) bool {
	switch r {
	case RoleSuperAdmin, RoleWarehouseManager, RoleWarehouseStaff:
		return true
	default:
		return false
	}
}

type User struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	Name         string              `bson:"name" json:"name"`
	Email        string              `bson:"email" json:"email"`
	PasswordHash string              `bson:"password_hash" json:"-"`
	Role         Role                `bson:"role" json:"role"`
	WarehouseID  *primitive.ObjectID `bson:"warehouse_id,omitempty" json:"warehouse_id,omitempty"`
	IsActive     bool                `bson:"is_active" json:"is_active"`
	CreatedAt    time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time           `bson:"updated_at" json:"updated_at"`
}

type RegisterRequest struct {
	Name        string `json:"name" binding:"required,min=2,max=100"`
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=8"`
	Role        Role   `json:"role" binding:"required"`
	WarehouseID string `json:"warehouse_id,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type UserResponse struct {
	ID          primitive.ObjectID  `json:"id"`
	Name        string              `json:"name"`
	Email       string              `json:"email"`
	Role        Role                `json:"role"`
	WarehouseID *primitive.ObjectID `json:"warehouse_id,omitempty"`
	IsActive    bool                `json:"is_active"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:          u.ID,
		Name:        u.Name,
		Email:       u.Email,
		Role:        u.Role,
		WarehouseID: u.WarehouseID,
		IsActive:    u.IsActive,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}
