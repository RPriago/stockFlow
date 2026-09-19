package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NotificationSeverity string

const (
	SeverityInfo    NotificationSeverity = "info"
	SeveritySuccess NotificationSeverity = "success"
	SeverityWarning NotificationSeverity = "warning"
	SeverityDanger  NotificationSeverity = "danger"
)

type NotificationType string

const (
	NotificationLowStock   NotificationType = "low_stock"
	NotificationOutOfStock NotificationType = "out_of_stock"
	NotificationPO         NotificationType = "purchase_order"
	NotificationSO         NotificationType = "sales_order"
	NotificationCapacity   NotificationType = "capacity"
	NotificationSystem     NotificationType = "system"
)

type Notification struct {
	ID             primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Type           NotificationType     `bson:"type" json:"type"`
	TitleID        string               `bson:"title_id" json:"title_id"`
	TitleEN        string               `bson:"title_en" json:"title_en"`
	MessageID      string               `bson:"message_id" json:"message_id"`
	MessageEN      string               `bson:"message_en" json:"message_en"`
	Severity       NotificationSeverity `bson:"severity" json:"severity"`
	Link           string               `bson:"link,omitempty" json:"link,omitempty"`
	EntityID       string               `bson:"entity_id,omitempty" json:"entity_id,omitempty"`
	IsRead         bool                 `bson:"is_read" json:"is_read"`
	IsDeleted      bool                 `bson:"is_deleted" json:"is_deleted"`
	ReadAt         *time.Time           `bson:"read_at,omitempty" json:"read_at,omitempty"`
	RemindAt       *time.Time           `bson:"remind_at,omitempty" json:"remind_at,omitempty"`
	DismissedUntil *time.Time           `bson:"dismissed_until,omitempty" json:"dismissed_until,omitempty"`
	CreatedAt      time.Time            `bson:"created_at" json:"created_at"`
	ExpiresAt      time.Time            `bson:"expires_at" json:"expires_at"`
}

type NotificationSummary struct {
	Notifications []Notification `json:"notifications"`
	UnreadCount   int            `json:"unread_count"`
	Total         int            `json:"total"`
}
