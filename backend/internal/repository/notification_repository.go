package repository

import (
	"context"
	"errors"
	"time"

	"stockflow-backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	ErrNotificationNotFound = errors.New("notification not found")
)

type NotificationRepository interface {
	CreateNotification(ctx context.Context, n *models.Notification) error
	FindActiveNotifications(ctx context.Context) ([]models.Notification, error)
	CountUnread(ctx context.Context) (int, error)
	MarkAsRead(ctx context.Context, id primitive.ObjectID) error
	MarkAllAsRead(ctx context.Context) error
	DeleteNotification(ctx context.Context, id primitive.ObjectID) error
	DeleteReadNotifications(ctx context.Context) error
	FindEntityNotification(ctx context.Context, entityID string) (*models.Notification, error)
	DeleteEntityNotification(ctx context.Context, entityID string) error
	UpdateNotification(ctx context.Context, n *models.Notification) error
}

type mongoNotificationRepository struct {
	coll *mongo.Collection
}

func NewNotificationRepository(db *mongo.Database) NotificationRepository {
	return &mongoNotificationRepository{
		coll: db.Collection("notifications"),
	}
}

func (r *mongoNotificationRepository) CreateNotification(ctx context.Context, n *models.Notification) error {
	now := time.Now()
	n.CreatedAt = now
	if n.ExpiresAt.IsZero() {
		n.ExpiresAt = now.Add(72 * time.Hour) // 3x24 hours default
	}
	if n.RemindAt == nil {
		remind := now.Add(24 * time.Hour)
		n.RemindAt = &remind
	}
	if n.ID.IsZero() {
		n.ID = primitive.NewObjectID()
	}

	_, err := r.coll.InsertOne(ctx, n)
	return err
}

func (r *mongoNotificationRepository) FindActiveNotifications(ctx context.Context) ([]models.Notification, error) {
	now := time.Now()
	filter := bson.M{
		"expires_at": bson.M{"$gt": now},
		"is_deleted": bson.M{"$ne": true},
	}
	findOptions := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(100)

	cursor, err := r.coll.Find(ctx, filter, findOptions)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var notifications []models.Notification
	if err := cursor.All(ctx, &notifications); err != nil {
		return nil, err
	}
	if notifications == nil {
		notifications = []models.Notification{}
	}
	return notifications, nil
}

func (r *mongoNotificationRepository) CountUnread(ctx context.Context) (int, error) {
	now := time.Now()
	filter := bson.M{
		"expires_at": bson.M{"$gt": now},
		"is_deleted": bson.M{"$ne": true},
		"is_read":    false,
	}
	count, err := r.coll.CountDocuments(ctx, filter)
	return int(count), err
}

func (r *mongoNotificationRepository) MarkAsRead(ctx context.Context, id primitive.ObjectID) error {
	now := time.Now()
	remindTime := now.Add(24 * time.Hour)
	filter := bson.M{"_id": id}
	update := bson.M{
		"$set": bson.M{
			"is_read":   true,
			"read_at":   now,
			"remind_at": remindTime,
		},
	}
	res, err := r.coll.UpdateOne(ctx, filter, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotificationNotFound
	}
	return nil
}

func (r *mongoNotificationRepository) MarkAllAsRead(ctx context.Context) error {
	now := time.Now()
	remindTime := now.Add(24 * time.Hour)
	filter := bson.M{
		"expires_at": bson.M{"$gt": now},
		"is_deleted": bson.M{"$ne": true},
		"is_read":    false,
	}
	update := bson.M{
		"$set": bson.M{
			"is_read":   true,
			"read_at":   now,
			"remind_at": remindTime,
		},
	}
	_, err := r.coll.UpdateMany(ctx, filter, update)
	return err
}

func (r *mongoNotificationRepository) DeleteNotification(ctx context.Context, id primitive.ObjectID) error {
	now := time.Now()
	var notif models.Notification
	err := r.coll.FindOne(ctx, bson.M{"_id": id}).Decode(&notif)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrNotificationNotFound
		}
		return err
	}

	// For entity notifications (such as stock alerts), dismiss for 24 hours so it won't resurrect on next poll
	if notif.EntityID != "" {
		dismissUntil := now.Add(24 * time.Hour)
		_, err := r.coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
			"$set": bson.M{
				"is_deleted":      true,
				"dismissed_until": dismissUntil,
			},
		})
		return err
	}

	// For standard messages, hard delete
	_, err = r.coll.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (r *mongoNotificationRepository) DeleteReadNotifications(ctx context.Context) error {
	now := time.Now()
	dismissUntil := now.Add(24 * time.Hour)

	// Dismiss entity notifications for 24 hours
	_, err := r.coll.UpdateMany(ctx,
		bson.M{"is_read": true, "entity_id": bson.M{"$ne": ""}},
		bson.M{"$set": bson.M{"is_deleted": true, "dismissed_until": dismissUntil}},
	)
	if err != nil {
		return err
	}

	// Hard delete non-entity notifications
	_, err = r.coll.DeleteMany(ctx, bson.M{"is_read": true, "entity_id": ""})
	return err
}

func (r *mongoNotificationRepository) FindEntityNotification(ctx context.Context, entityID string) (*models.Notification, error) {
	now := time.Now()
	filter := bson.M{
		"entity_id":  entityID,
		"expires_at": bson.M{"$gt": now},
	}
	var notif models.Notification
	err := r.coll.FindOne(ctx, filter).Decode(&notif)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	return &notif, nil
}

func (r *mongoNotificationRepository) DeleteEntityNotification(ctx context.Context, entityID string) error {
	_, err := r.coll.DeleteMany(ctx, bson.M{"entity_id": entityID})
	return err
}

func (r *mongoNotificationRepository) UpdateNotification(ctx context.Context, n *models.Notification) error {
	filter := bson.M{"_id": n.ID}
	update := bson.M{
		"$set": bson.M{
			"type":            n.Type,
			"title_id":        n.TitleID,
			"title_en":        n.TitleEN,
			"message_id":      n.MessageID,
			"message_en":      n.MessageEN,
			"severity":        n.Severity,
			"link":            n.Link,
			"is_read":         n.IsRead,
			"is_deleted":      n.IsDeleted,
			"read_at":         n.ReadAt,
			"remind_at":       n.RemindAt,
			"dismissed_until": n.DismissedUntil,
			"created_at":      n.CreatedAt,
			"expires_at":      n.ExpiresAt,
		},
	}
	_, err := r.coll.UpdateOne(ctx, filter, update)
	return err
}
