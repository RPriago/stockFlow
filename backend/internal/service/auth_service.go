package service

import (
	"context"
	"errors"
	"sync"
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
	ErrAccountLocked      = errors.New("too many failed login attempts, account temporarily locked for 15 minutes")
	ErrInvalidRole        = errors.New("invalid user role")

	// Pre-hashed dummy bcrypt string used to equalize timing for non-existent users,
	// preventing user enumeration attacks.
	dummyHash = "$2a$10$7EqJtq98hPqEX7fNZaFWoO0vQpLdJ0y3/VqG18c1GqK1Vd0iN7KkG"
)

type AuthService interface {
	Login(ctx context.Context, req models.LoginRequest) (*models.User, string, time.Time, error)
	Register(ctx context.Context, req models.RegisterRequest) (*models.User, error)
	PublicRegister(ctx context.Context, req models.RegisterRequest) (*models.User, string, time.Time, error)
	GetCurrentUser(ctx context.Context, userID primitive.ObjectID) (*models.User, error)
	ListUsers(ctx context.Context, page, limit int64) ([]models.UserResponse, int64, error)
	UpdateUser(ctx context.Context, currentUserID, targetUserID primitive.ObjectID, req models.UpdateUserRequest) (*models.User, error)
	DeleteUser(ctx context.Context, currentUserID, targetUserID primitive.ObjectID) error
	SeedInitialAdmin(ctx context.Context) error
}

type failedLoginEntry struct {
	count       int
	lastAttempt time.Time
	lockedUntil time.Time
}

type authService struct {
	userRepo      repository.UserRepository
	cfg           *config.Config
	failedLogins  map[string]*failedLoginEntry
	failedLoginMu sync.Mutex
}

func NewAuthService(userRepo repository.UserRepository, cfg *config.Config) AuthService {
	return &authService{
		userRepo:     userRepo,
		cfg:          cfg,
		failedLogins: make(map[string]*failedLoginEntry),
	}
}

func (s *authService) recordFailedAttempt(email string) {
	s.failedLoginMu.Lock()
	defer s.failedLoginMu.Unlock()

	now := time.Now()
	if len(s.failedLogins) >= 1000 {
		for k, v := range s.failedLogins {
			if (!v.lockedUntil.IsZero() && now.After(v.lockedUntil)) || now.Sub(v.lastAttempt) > 15*time.Minute {
				delete(s.failedLogins, k)
			}
		}
	}

	entry, exists := s.failedLogins[email]
	if !exists || (!entry.lockedUntil.IsZero() && now.After(entry.lockedUntil)) || now.Sub(entry.lastAttempt) > 15*time.Minute {
		entry = &failedLoginEntry{}
		s.failedLogins[email] = entry
	}
	entry.count++
	entry.lastAttempt = now
	if entry.count >= 5 {
		entry.lockedUntil = now.Add(15 * time.Minute)
	}
}

func (s *authService) resetFailedAttempts(email string) {
	s.failedLoginMu.Lock()
	defer s.failedLoginMu.Unlock()
	delete(s.failedLogins, email)
}

func (s *authService) Login(ctx context.Context, req models.LoginRequest) (*models.User, string, time.Time, error) {
	// SEC-005/009: Check if account is temporarily locked due to excessive failed attempts
	s.failedLoginMu.Lock()
	now := time.Now()
	entry, exists := s.failedLogins[req.Email]
	if exists && now.Before(entry.lockedUntil) {
		s.failedLoginMu.Unlock()
		return nil, "", time.Time{}, ErrAccountLocked
	}
	s.failedLoginMu.Unlock()

	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			// Defend against timing attacks / user enumeration: perform constant-time
			// bcrypt comparison so response time does not leak account existence.
			utils.CheckPasswordHash(req.Password, dummyHash)
			s.recordFailedAttempt(req.Email)
			return nil, "", time.Time{}, ErrInvalidCredentials
		}
		return nil, "", time.Time{}, err
	}

	if !user.IsActive {
		s.recordFailedAttempt(req.Email)
		return nil, "", time.Time{}, ErrAccountInactive
	}

	if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
		s.recordFailedAttempt(req.Email)
		return nil, "", time.Time{}, ErrInvalidCredentials
	}

	s.resetFailedAttempts(req.Email)

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

	return nil
}

func (s *authService) PublicRegister(ctx context.Context, req models.RegisterRequest) (*models.User, string, time.Time, error) {
	// Strictly allow only warehouse_staff and warehouse_manager for public demo testing
	if req.Role != models.RoleWarehouseStaff && req.Role != models.RoleWarehouseManager {
		return nil, "", time.Time{}, errors.New("public registration is only available for warehouse_staff and warehouse_manager roles")
	}

	user, err := s.Register(ctx, req)
	if err != nil {
		return nil, "", time.Time{}, err
	}

	token, expiresAt, err := utils.GenerateJWT(user, s.cfg.JWTSecret, s.cfg.JWTExpiryHours)
	if err != nil {
		return nil, "", time.Time{}, err
	}

	return user, token, expiresAt, nil
}

func (s *authService) UpdateUser(ctx context.Context, currentUserID, targetUserID primitive.ObjectID, req models.UpdateUserRequest) (*models.User, error) {
	user, err := s.userRepo.FindByID(ctx, targetUserID)
	if err != nil {
		return nil, err
	}

	if !models.IsValidRole(req.Role) {
		return nil, ErrInvalidRole
	}

	user.Name = req.Name
	user.Email = req.Email
	user.Role = req.Role

	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}

	if req.WarehouseID != "" {
		oid, err := primitive.ObjectIDFromHex(req.WarehouseID)
		if err != nil {
			return nil, errors.New("invalid warehouse_id format")
		}
		user.WarehouseID = &oid
	} else {
		user.WarehouseID = nil
	}

	if req.Password != "" {
		if len(req.Password) < 8 {
			return nil, errors.New("password must be at least 8 characters")
		}
		hash, err := utils.HashPassword(req.Password)
		if err != nil {
			return nil, err
		}
		user.PasswordHash = hash
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *authService) DeleteUser(ctx context.Context, currentUserID, targetUserID primitive.ObjectID) error {
	if currentUserID == targetUserID {
		return errors.New("you cannot delete your own account")
	}

	return s.userRepo.Delete(ctx, targetUserID)
}
