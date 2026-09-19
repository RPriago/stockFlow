package service

import (
	"context"
	"testing"
	"time"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestNotificationService_LowStockAndExpiry(t *testing.T) {
	ctx := context.Background()
	notifRepo := repository.NewNotificationMemoryRepository()
	prodRepo := repository.NewProductMemoryRepository()
	invRepo := repository.NewMemoryInventoryRepository()

	svc := NewNotificationService(notifRepo, prodRepo, invRepo)

	// 1. Initially, no notifications
	res, err := svc.GetNotifications(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.UnreadCount != 0 || res.Total != 0 {
		t.Fatalf("expected 0 notifications, got %d (unread: %d)", res.Total, res.UnreadCount)
	}

	// 2. Create product with min stock = 10, total on hand = 0
	prod := &models.Product{
		ID:       primitive.NewObjectID(),
		SKU:      "TEP-2843",
		Name:     "Tepung",
		Unit:     "kg",
		MinStock: 10,
	}
	_ = prodRepo.CreateProduct(ctx, prod)

	// 3. Call GetNotifications -> Must automatically detect Out of Stock for Tepung
	res, err = svc.GetNotifications(ctx)
	if err != nil {
		t.Fatalf("failed to get notifications: %v", err)
	}
	if res.Total != 1 {
		t.Fatalf("expected 1 notification for Tepung, got %d", res.Total)
	}
	if res.UnreadCount != 1 {
		t.Fatalf("expected 1 unread notification, got %d", res.UnreadCount)
	}
	notif := res.Notifications[0]
	if notif.Type != models.NotificationOutOfStock {
		t.Errorf("expected type %s, got %s", models.NotificationOutOfStock, notif.Type)
	}
	if notif.IsRead {
		t.Errorf("expected is_read to be false")
	}

	// 4. Test MarkAsRead -> Must stay read on subsequent GetNotifications calls within 24h!
	err = svc.MarkAsRead(ctx, notif.ID)
	if err != nil {
		t.Fatalf("failed to mark as read: %v", err)
	}

	// Call GetNotifications again immediately -> MUST STILL BE READ (unread_count = 0)
	resAfterRead, _ := svc.GetNotifications(ctx)
	if resAfterRead.UnreadCount != 0 {
		t.Fatalf("expected 0 unread on repeated GetNotifications after mark as read, got %d (alert spammed again!)", resAfterRead.UnreadCount)
	}

	// 5. Test DeleteNotification -> Must stay deleted on subsequent GetNotifications calls within 24h!
	err = svc.DeleteNotification(ctx, notif.ID)
	if err != nil {
		t.Fatalf("failed to delete notification: %v", err)
	}

	// Call GetNotifications again immediately -> MUST REMAIN DELETED (total = 0)
	resAfterDelete, _ := svc.GetNotifications(ctx)
	if resAfterDelete.Total != 0 {
		t.Fatalf("expected 0 notifications after delete, got %d (alert resurrected immediately!)", resAfterDelete.Total)
	}

	// 6. Test 24h Reminder Trigger:
	// Simulate 25 hours passing without restocking
	existing, _ := notifRepo.FindEntityNotification(ctx, "low_stock:TEP-2843")
	if existing == nil {
		t.Fatalf("expected entity notification tracking record to exist")
	}
	pastTime := time.Now().Add(-25 * time.Hour)
	existing.DismissedUntil = &pastTime // 24h window elapsed
	_ = notifRepo.UpdateNotification(ctx, existing)

	// Now GetNotifications must resurface the notification as a 24h reminder!
	resAfter24h, _ := svc.GetNotifications(ctx)
	if resAfter24h.Total != 1 {
		t.Fatalf("expected 1 reminder notification after 24h, got %d", resAfter24h.Total)
	}
	if resAfter24h.UnreadCount != 1 {
		t.Fatalf("expected unread count to be 1 for 24h reminder, got %d", resAfter24h.UnreadCount)
	}

	// 7. Test Restocking Product -> Must automatically remove notification
	// Add 50 kg of Tepung (above min stock 10)
	_, _, _ = invRepo.StockIn(ctx, &models.InventoryItem{
		ProductID:   prod.ID,
		WarehouseID: primitive.NewObjectID(),
		LocationID:  primitive.NewObjectID(),
	}, 50)

	resAfterRestock, _ := svc.GetNotifications(ctx)
	if resAfterRestock.Total != 0 {
		t.Fatalf("expected notification to be cleared after restock, got %d", resAfterRestock.Total)
	}
}

func TestNotificationService_MarkAllReadAndClear(t *testing.T) {
	ctx := context.Background()
	notifRepo := repository.NewNotificationMemoryRepository()
	prodRepo := repository.NewProductMemoryRepository()
	invRepo := repository.NewMemoryInventoryRepository()

	svc := NewNotificationService(notifRepo, prodRepo, invRepo)

	// Add 2 notifications
	_ = svc.TriggerNotification(ctx, &models.Notification{
		Type:      models.NotificationPO,
		TitleID:   "PO Dikonfirmasi",
		TitleEN:   "PO Confirmed",
		MessageID: "Pesanan Pembelian PO-2026-001 telah dikonfirmasi.",
		MessageEN: "PO-2026-001 has been confirmed.",
		Severity:  models.SeverityInfo,
	})
	_ = svc.TriggerNotification(ctx, &models.Notification{
		Type:      models.NotificationSO,
		TitleID:   "Pesanan Baru",
		TitleEN:   "New Order",
		MessageID: "Pesanan Penjualan SO-2026-001 menunggu proses picking.",
		MessageEN: "SO-2026-001 is awaiting picking.",
		Severity:  models.SeverityInfo,
	})

	summary, err := svc.GetNotifications(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.UnreadCount != 2 {
		t.Fatalf("expected 2 unread notifications, got %d", summary.UnreadCount)
	}

	// Mark all as read
	err = svc.MarkAllAsRead(ctx)
	if err != nil {
		t.Fatalf("failed to mark all as read: %v", err)
	}

	summaryAfterRead, _ := svc.GetNotifications(ctx)
	if summaryAfterRead.UnreadCount != 0 {
		t.Fatalf("expected 0 unread, got %d", summaryAfterRead.UnreadCount)
	}
	if summaryAfterRead.Total != 2 {
		t.Fatalf("expected total to still be 2, got %d", summaryAfterRead.Total)
	}

	// Clear read
	err = svc.ClearReadNotifications(ctx)
	if err != nil {
		t.Fatalf("failed to clear read notifications: %v", err)
	}

	summaryAfterClear, _ := svc.GetNotifications(ctx)
	if summaryAfterClear.Total != 0 {
		t.Fatalf("expected 0 notifications after clear, got %d", summaryAfterClear.Total)
	}
}
