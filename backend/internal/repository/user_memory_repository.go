package repository

import (
	"context"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"stockflow-backend/internal/models"
)

type userMemoryRepository struct {
	mu    sync.RWMutex
	users map[primitive.ObjectID]*models.User
}

func NewUserMemoryRepository() UserRepository {
	return &userMemoryRepository{
		users: make(map[primitive.ObjectID]*models.User),
	}
}

func (r *userMemoryRepository) Create(ctx context.Context, user *models.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check unique email
	for _, existing := range r.users {
		if existing.Email == user.Email {
			return ErrUserAlreadyExists
		}
	}

	now := time.Now()
	user.CreatedAt = now
	user.UpdatedAt = now
	if user.ID.IsZero() {
		user.ID = primitive.NewObjectID()
	}

	// Store copy
	copied := *user
	r.users[user.ID] = &copied
	return nil
}

func (r *userMemoryRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, user := range r.users {
		if user.Email == email {
			copied := *user
			return &copied, nil
		}
	}
	return nil, ErrUserNotFound
}

func (r *userMemoryRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	user, exists := r.users[id]
	if !exists {
		return nil, ErrUserNotFound
	}
	copied := *user
	return &copied, nil
}

func (r *userMemoryRepository) FindAll(ctx context.Context, limit, skip int64) ([]models.User, int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	total := int64(len(r.users))
	all := make([]models.User, 0, len(r.users))
	for _, u := range r.users {
		all = append(all, *u)
	}

	// Simple pagination
	start := skip
	if start > total {
		return []models.User{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}

	return all[start:end], total, nil
}

func (r *userMemoryRepository) Count(ctx context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return int64(len(r.users)), nil
}
