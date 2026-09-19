package repository

import (
	"context"
	"sort"
	"sync"
	"time"

	"stockflow-backend/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type notificationMemoryRepository struct {
	mu            sync.RWMutex
	notifications map[primitive.ObjectID]*models.Notification
}

func NewNotificationMemoryRepository() NotificationRepository {
	return &notificationMemoryRepository{
		notifications: make(map[primitive.ObjectID]*models.Notification),
	}
}

func (r *notificationMemoryRepository) CreateNotification(ctx context.Context, n *models.Notification) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	n.CreatedAt = now
	if n.ExpiresAt.IsZero() {
		n.ExpiresAt = now.Add(72 * time.Hour)
	}
	if n.RemindAt == nil {
		remind := now.Add(24 * time.Hour)
		n.RemindAt = &remind
	}
	if n.ID.IsZero() {
		n.ID = primitive.NewObjectID()
	}

	copied := *n
	r.notifications[n.ID] = &copied
	return nil
}

func (r *notificationMemoryRepository) FindActiveNotifications(ctx context.Context) ([]models.Notification, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	now := time.Now()
	res := make([]models.Notification, 0)
	for _, n := range r.notifications {
		if n.ExpiresAt.After(now) && !n.IsDeleted {
			res = append(res, *n)
		}
	}

	sort.Slice(res, func(i, j int) bool {
		return res[i].CreatedAt.After(res[j].CreatedAt)
	})

	return res, nil
}

func (r *notificationMemoryRepository) CountUnread(ctx context.Context) (int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	now := time.Now()
	count := 0
	for _, n := range r.notifications {
		if n.ExpiresAt.After(now) && !n.IsDeleted && !n.IsRead {
			count++
		}
	}
	return count, nil
}

func (r *notificationMemoryRepository) MarkAsRead(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	n, exists := r.notifications[id]
	if !exists {
		return ErrNotificationNotFound
	}
	now := time.Now()
	remind := now.Add(24 * time.Hour)
	n.IsRead = true
	n.ReadAt = &now
	n.RemindAt = &remind
	return nil
}

func (r *notificationMemoryRepository) MarkAllAsRead(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	remind := now.Add(24 * time.Hour)
	for _, n := range r.notifications {
		if n.ExpiresAt.After(now) && !n.IsDeleted {
			n.IsRead = true
			n.ReadAt = &now
			n.RemindAt = &remind
		}
	}
	return nil
}

func (r *notificationMemoryRepository) DeleteNotification(ctx context.Context, id primitive.ObjectID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	n, exists := r.notifications[id]
	if !exists {
		return ErrNotificationNotFound
	}

	now := time.Now()
	if n.EntityID != "" {
		dismiss := now.Add(24 * time.Hour)
		n.IsDeleted = true
		n.DismissedUntil = &dismiss
		return nil
	}

	delete(r.notifications, id)
	return nil
}

func (r *notificationMemoryRepository) DeleteReadNotifications(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	dismiss := now.Add(24 * time.Hour)
	for id, n := range r.notifications {
		if n.IsRead {
			if n.EntityID != "" {
				n.IsDeleted = true
				n.DismissedUntil = &dismiss
			} else {
				delete(r.notifications, id)
			}
		}
	}
	return nil
}

func (r *notificationMemoryRepository) FindEntityNotification(ctx context.Context, entityID string) (*models.Notification, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	now := time.Now()
	for _, n := range r.notifications {
		if n.EntityID == entityID && n.ExpiresAt.After(now) {
			copied := *n
			return &copied, nil
		}
	}
	return nil, nil
}

func (r *notificationMemoryRepository) DeleteEntityNotification(ctx context.Context, entityID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for id, n := range r.notifications {
		if n.EntityID == entityID {
			delete(r.notifications, id)
		}
	}
	return nil
}

func (r *notificationMemoryRepository) UpdateNotification(ctx context.Context, n *models.Notification) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copied := *n
	r.notifications[n.ID] = &copied
	return nil
}
