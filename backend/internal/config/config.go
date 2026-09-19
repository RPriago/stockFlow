package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                 string
	MongoURI             string
	DBName               string
	JWTSecret            string
	JWTExpiryHours       int
	CookieDomain         string
	CookieSecure         bool
	FrontendURL          string
	InitialAdminEmail    string
	InitialAdminPassword string
	InitialAdminName     string
	UseInMemoryDB        bool
}

func LoadConfig() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found or could not be loaded, relying on environment variables")
	}

	jwtExpiryHours, err := strconv.Atoi(getEnv("JWT_EXPIRY_HOURS", "24"))
	if err != nil {
		jwtExpiryHours = 24
	}

	cookieSecure, _ := strconv.ParseBool(getEnv("COOKIE_SECURE", "false"))
	useInMemoryDB, _ := strconv.ParseBool(getEnv("USE_IN_MEMORY_DB", "false"))

	return &Config{
		Port:                 getEnv("PORT", "8080"),
		MongoURI:             getEnv("MONGO_URI", "mongodb://localhost:27017"),
		DBName:               getEnv("DB_NAME", "stockflow"),
		JWTSecret:            getEnv("JWT_SECRET", "stockflow-secret-key-production-ready-2026"),
		JWTExpiryHours:       jwtExpiryHours,
		CookieDomain:         getEnv("COOKIE_DOMAIN", ""),
		CookieSecure:         cookieSecure,
		FrontendURL:          getEnv("FRONTEND_URL", "http://localhost:3000"),
		InitialAdminEmail:    getEnv("INITIAL_ADMIN_EMAIL", "admin@stockflow.com"),
		InitialAdminPassword: getEnv("INITIAL_ADMIN_PASSWORD", "Admin123!"),
		InitialAdminName:     getEnv("INITIAL_ADMIN_NAME", "System Super Admin"),
		UseInMemoryDB:        useInMemoryDB,
	}
}

func getEnv(key, defaultValue string) string {
	if val, exists := os.LookupEnv(key); exists && val != "" {
		return val
	}
	return defaultValue
}
