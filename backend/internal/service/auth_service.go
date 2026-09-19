package service

import (
	"context"
	"errors"
	"log"
	"time"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/utils"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrAccountInactive    = errors.New("user account is inactive")
	ErrInvalidRole        = errors.New("invalid user role")
)

type AuthService interface {
	Login(ctx context.Context, req models.LoginRequest) (*models.User, string, time.Time, error)
	Register(ctx context.Context, req models.RegisterRequest) (*models.User, error)
	GetCurrentUser(ctx context.Context, userID primitive.ObjectID) (*models.User, error)
	ListUsers(ctx context.Context, page, limit int64) ([]models.UserResponse, int64, error)
	SeedInitialAdmin(ctx context.Context) error
}

type authService struct {
	userRepo repository.UserRepository
	cfg      *config.Config
}

func NewAuthService(userRepo repository.UserRepository, cfg *config.Config) AuthService {
	return &authService{
		userRepo: userRepo,
		cfg:      cfg,
	}
}

func (s *authService) Login(ctx context.Context, req models.LoginRequest) (*models.User, string, time.Time, error) {
	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, "", time.Time{}, ErrInvalidCredentials
		}
		return nil, "", time.Time{}, err
	}

	if !user.IsActive {
		return nil, "", time.Time{}, ErrAccountInactive
	}

	if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
		return nil, "", time.Time{}, ErrInvalidCredentials
	}

	token, expiresAt, err := utils.GenerateJWT(user, s.cfg.JWTSecret, s.cfg.JWTExpiryHours)
	if err != nil {
		return nil, "", time.Time{}, err
	}

	return user, token, expiresAt, nil
}

func (s *authService) Register(ctx context.Context, req models.RegisterRequest) (*models.User, error) {
	if !models.IsValidRole(req.Role) {
		return nil, ErrInvalidRole
	}

	hash, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	var warehouseID *primitive.ObjectID
	if req.WarehouseID != "" {
		oid, err := primitive.ObjectIDFromHex(req.WarehouseID)
		if err != nil {
			return nil, errors.New("invalid warehouse_id format")
		}
		warehouseID = &oid
	}

	user := &models.User{
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         req.Role,
		WarehouseID:  warehouseID,
		IsActive:     true,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *authService) GetCurrentUser(ctx context.Context, userID primitive.ObjectID) (*models.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}

func (s *authService) ListUsers(ctx context.Context, page, limit int64) ([]models.UserResponse, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}
	skip := (page - 1) * limit

	users, total, err := s.userRepo.FindAll(ctx, limit, skip)
	if err != nil {
		return nil, 0, err
	}

	res := make([]models.UserResponse, len(users))
	for i, u := range users {
		res[i] = u.ToResponse()
	}

	return res, total, nil
}

func (s *authService) SeedInitialAdmin(ctx context.Context) error {
	count, err := s.userRepo.Count(ctx)
	if err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	log.Printf("No users found. Seeding initial Super Admin (%s)...\n", s.cfg.InitialAdminEmail)
	hash, err := utils.HashPassword(s.cfg.InitialAdminPassword)
	if err != nil {
		return err
	}

	admin := &models.User{
		Name:         s.cfg.InitialAdminName,
		Email:        s.cfg.InitialAdminEmail,
		PasswordHash: hash,
		Role:         models.RoleSuperAdmin,
		IsActive:     true,
	}

	if err := s.userRepo.Create(ctx, admin); err != nil {
		return err
	}

	log.Println("Initial Super Admin successfully seeded.")
	return nil
}
