package service

import (
	"context"
	"fmt"
	"time"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NotificationService interface {
	GetNotifications(ctx context.Context) (*models.NotificationSummary, error)
	MarkAsRead(ctx context.Context, id primitive.ObjectID) error
	MarkAllAsRead(ctx context.Context) error
	DeleteNotification(ctx context.Context, id primitive.ObjectID) error
	ClearReadNotifications(ctx context.Context) error
	TriggerNotification(ctx context.Context, n *models.Notification) error
	SyncLowStockAlerts(ctx context.Context) error
}

type notificationService struct {
	notifRepo   repository.NotificationRepository
	productRepo repository.ProductRepository
	invRepo     repository.InventoryRepository
}

func NewNotificationService(
	notifRepo repository.NotificationRepository,
	productRepo repository.ProductRepository,
	invRepo repository.InventoryRepository,
) NotificationService {
	return &notificationService{
		notifRepo:   notifRepo,
		productRepo: productRepo,
		invRepo:     invRepo,
	}
}

// SyncLowStockAlerts checks inventory balances vs safety thresholds and manages alerts with 24h reminder & dismissal cooldown
func (s *notificationService) SyncLowStockAlerts(ctx context.Context) error {
	if s.productRepo == nil || s.invRepo == nil {
		return nil
	}

	products, _, err := s.productRepo.FindProducts(ctx, models.ProductQueryParam{Limit: 500})
	if err != nil {
		return err
	}

	now := time.Now()
	for _, p := range products {
		// Calculate total on hand across all warehouses for this product
		items, _, err := s.invRepo.FindItems(ctx, models.InventoryQueryParam{ProductID: p.ID.Hex(), Limit: 500})
		if err != nil {
			continue
		}

		totalOnHand := 0
		for _, it := range items {
			totalOnHand += it.QuantityOnHand
		}

		entityKey := "low_stock:" + p.SKU

		// Condition A: Product is HEALTHY (stock is above safety threshold)
		// If an alert was previously active, clear it because the problem is resolved!
		if (p.MinStock > 0 && totalOnHand > p.MinStock) || (p.MinStock == 0 && totalOnHand > 0) {
			_ = s.notifRepo.DeleteEntityNotification(ctx, entityKey)
			continue
		}

		// Condition B: Product is OUT OF STOCK (0 units) or LOW STOCK (<= min threshold)
		var notifType models.NotificationType
		var severity models.NotificationSeverity
		var titleID, titleEN, msgID, msgEN string

		if totalOnHand == 0 {
			notifType = models.NotificationOutOfStock
			severity = models.SeverityDanger
			titleID = fmt.Sprintf("Stok Habis: %s", p.Name)
			titleEN = fmt.Sprintf("Out of Stock: %s", p.Name)
			msgID = fmt.Sprintf("Stok produk %s (%s) habis (0 %s tersisa). Harap segera lakukan restok.", p.Name, p.SKU, p.Unit)
			msgEN = fmt.Sprintf("Product %s (%s) is out of stock (0 %s remaining). Immediate restock required.", p.Name, p.SKU, p.Unit)
		} else {
			notifType = models.NotificationLowStock
			severity = models.SeverityWarning
			titleID = fmt.Sprintf("Peringatan Stok Menipis: %s", p.Name)
			titleEN = fmt.Sprintf("Low Stock Alert: %s", p.Name)
			msgID = fmt.Sprintf("Stok produk %s (%s) tersisa %d %s (batas minimum: %d %s).", p.Name, p.SKU, totalOnHand, p.Unit, p.MinStock, p.Unit)
			msgEN = fmt.Sprintf("Stock for %s (%s) is running low: %d %s left (safety min: %d %s).", p.Name, p.SKU, totalOnHand, p.Unit, p.MinStock, p.Unit)
		}

		// Check if notification already exists for this product
		existing, _ := s.notifRepo.FindEntityNotification(ctx, entityKey)

		if existing == nil {
			// Brand new alert
			remind := now.Add(24 * time.Hour)
			_ = s.notifRepo.CreateNotification(ctx, &models.Notification{
				Type:      notifType,
				TitleID:   titleID,
				TitleEN:   titleEN,
				MessageID: msgID,
				MessageEN: msgEN,
				Severity:  severity,
				Link:      "/inventory",
				EntityID:  entityKey,
				IsRead:    false,
				IsDeleted: false,
				CreatedAt: now,
				ExpiresAt: now.Add(72 * time.Hour), // 3x24 hours
				RemindAt:  &remind,
			})
		} else {
			// Subcase 1: User explicitly DELETED this alert
			if existing.IsDeleted {
				if existing.DismissedUntil != nil && now.Before(*existing.DismissedUntil) {
					// Within 24 hours of deletion: DO NOT RECREATE! Respect user's dismissal!
					continue
				}
				// 24 hours have elapsed and stock is STILL empty/low! Resurface as 24h reminder
				remind := now.Add(24 * time.Hour)
				existing.Type = notifType
				existing.TitleID = fmt.Sprintf("Pengingat 24 Jam: %s", titleID)
				existing.TitleEN = fmt.Sprintf("24h Reminder: %s", titleEN)
				existing.MessageID = msgID
				existing.MessageEN = msgEN
				existing.Severity = severity
				existing.IsDeleted = false
				existing.IsRead = false // Resurfaces red dot after 24h
				existing.DismissedUntil = nil
				existing.RemindAt = &remind
				existing.CreatedAt = now
				existing.ExpiresAt = now.Add(72 * time.Hour)
				_ = s.notifRepo.UpdateNotification(ctx, existing)
				continue
			}

			// Subcase 2: User has READ this alert (is_read: true)
			if existing.IsRead {
				if existing.RemindAt != nil && now.Before(*existing.RemindAt) {
					// Within 24 hours of being read: DO NOT RESET is_read to false!
					// Keep is_read: true, do not buzz with red dot
					existing.Type = notifType
					existing.MessageID = msgID
					existing.MessageEN = msgEN
					existing.Severity = severity
					_ = s.notifRepo.UpdateNotification(ctx, existing)
					continue
				}
				// 24 hours have elapsed and stock is STILL empty/low! Resurface as 24h reminder
				remind := now.Add(24 * time.Hour)
				existing.Type = notifType
				existing.TitleID = fmt.Sprintf("Pengingat 24 Jam: %s", titleID)
				existing.TitleEN = fmt.Sprintf("24h Reminder: %s", titleEN)
				existing.MessageID = msgID
				existing.MessageEN = msgEN
				existing.Severity = severity
				existing.IsRead = false // Resurfaces red dot after 24h
				existing.RemindAt = &remind
				existing.CreatedAt = now
				existing.ExpiresAt = now.Add(72 * time.Hour)
				_ = s.notifRepo.UpdateNotification(ctx, existing)
				continue
			}

			// Subcase 3: Alert is currently active and unread
			existing.Type = notifType
			existing.TitleID = titleID
			existing.TitleEN = titleEN
			existing.MessageID = msgID
			existing.MessageEN = msgEN
			existing.Severity = severity
			_ = s.notifRepo.UpdateNotification(ctx, existing)
		}
	}

	return nil
}

func (s *notificationService) GetNotifications(ctx context.Context) (*models.NotificationSummary, error) {
	// 1. Synchronize latest stock warnings
	_ = s.SyncLowStockAlerts(ctx)

	// 2. Fetch active non-expired notifications
	notifs, err := s.notifRepo.FindActiveNotifications(ctx)
	if err != nil {
		return nil, err
	}

	// 3. Count unread
	unread, err := s.notifRepo.CountUnread(ctx)
	if err != nil {
		unread = 0
		for _, n := range notifs {
			if !n.IsRead {
				unread++
			}
		}
	}

	return &models.NotificationSummary{
		Notifications: notifs,
		UnreadCount:   unread,
		Total:         len(notifs),
	}, nil
}

func (s *notificationService) MarkAsRead(ctx context.Context, id primitive.ObjectID) error {
	return s.notifRepo.MarkAsRead(ctx, id)
}

func (s *notificationService) MarkAllAsRead(ctx context.Context) error {
	return s.notifRepo.MarkAllAsRead(ctx)
}

func (s *notificationService) DeleteNotification(ctx context.Context, id primitive.ObjectID) error {
	return s.notifRepo.DeleteNotification(ctx, id)
}

func (s *notificationService) ClearReadNotifications(ctx context.Context) error {
	return s.notifRepo.DeleteReadNotifications(ctx)
}

func (s *notificationService) TriggerNotification(ctx context.Context, n *models.Notification) error {
	now := time.Now()
	if n.ExpiresAt.IsZero() {
		n.ExpiresAt = now.Add(72 * time.Hour)
	}
	if n.RemindAt == nil {
		remind := now.Add(24 * time.Hour)
		n.RemindAt = &remind
	}
	return s.notifRepo.CreateNotification(ctx, n)
}
