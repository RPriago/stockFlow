package utils

import (
	"testing"
)

func TestHashPasswordAndCheck(t *testing.T) {
	password := "SecretP@ssw0rd123"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

	if hash == password {
		t.Errorf("Hash should not be equal to plain password")
	}

	if !CheckPasswordHash(password, hash) {
		t.Errorf("CheckPasswordHash should return true for valid password")
	}

	if CheckPasswordHash("WrongPassword", hash) {
		t.Errorf("CheckPasswordHash should return false for incorrect password")
	}
}
