package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

func main() {
	_ = godotenv.Load()

	uri := os.Getenv("MONGO_URI")
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "stockflow"
	}

	fmt.Printf("🔍 Testing MongoDB Connection...\n")
	fmt.Printf("📌 Target Database: %s\n", dbName)
	if uri == "" {
		fmt.Printf("❌ ERROR: MONGO_URI is empty in backend/.env\n")
		return
	}

	// Mask password for display
	fmt.Printf("📌 MONGO_URI: %s\n\n", uri)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOptions := options.Client().ApplyURI(uri).SetConnectTimeout(8 * time.Second)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		fmt.Printf("❌ FAILED to initialize Mongo client: %v\n", err)
		return
	}
	defer client.Disconnect(ctx)

	fmt.Println("⏳ Pinging MongoDB server...")
	err = client.Ping(ctx, readpref.Primary())
	if err != nil {
		fmt.Printf("❌ PING FAILED: %v\n\n", err)
		fmt.Println("👉 Kemungkinan penyebab:")
		fmt.Println("1. Kata sandi (password) di MONGO_URI belum diisi atau salah.")
		fmt.Println("2. IP Whitelist di MongoDB Atlas belum diset ke '0.0.0.0/0' (Network Access).")
		fmt.Println("3. Database user belum memiliki hak akses 'Read and write to any database'.")
		return
	}

	fmt.Printf("✅ BERHASIL TERKONEKSI ke MongoDB Atlas!\n")
	db := client.Database(dbName)
	collections, err := db.ListCollectionNames(ctx, bson.M{})
	if err == nil {
		fmt.Printf("📂 Koleksi yang tersedia di '%s': %v\n", dbName, collections)
	}
}
