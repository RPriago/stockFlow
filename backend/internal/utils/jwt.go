package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"stockflow-backend/internal/models"
)

type JWTClaims struct {
	UserID string      `json:"user_id"`
	Email  string      `json:"email"`
	Role   models.Role `json:"role"`
	Name   string      `json:"name"`
	jwt.RegisteredClaims
}

func GenerateJWT(user *models.User, secret string, expiryHours int) (string, time.Time, error) {
	expirationTime := time.Now().Add(time.Duration(expiryHours) * time.Hour)

	claims := &JWTClaims{
		UserID: user.ID.Hex(),
		Email:  user.Email,
		Role:   user.Role,
		Name:   user.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "stockflow-backend",
			Subject:   user.ID.Hex(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, err
	}

	return tokenString, expirationTime, nil
}

func ValidateJWT(tokenString, secret string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}
