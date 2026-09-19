package database

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

func ConnectMongoDB(uri, dbName string) (*MongoDB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	clientOptions := options.Client().
		ApplyURI(uri).
		SetMaxPoolSize(50).
		SetMinPoolSize(5).
		SetMaxConnIdleTime(30 * time.Second).
		SetConnectTimeout(8 * time.Second)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, err
	}

	// Ping database
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		return nil, err
	}

	log.Printf("Successfully connected to MongoDB database: %s\n", dbName)
	db := client.Database(dbName)

	return &MongoDB{
		Client:   client,
		Database: db,
	}, nil
}

func (m *MongoDB) EnsureIndexes(ctx context.Context) error {
	// Unique index on users.email
	userColl := m.Database.Collection("users")
	_, err := userColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on users.email: %v\n", err)
	}

	// Unique index on products.sku
	prodColl := m.Database.Collection("products")
	_, err = prodColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "sku", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on products.sku: %v\n", err)
	}

	// Unique index on categories.slug
	catColl := m.Database.Collection("categories")
	_, err = catColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "slug", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on categories.slug: %v\n", err)
	}

	// Unique index on warehouses.code
	whColl := m.Database.Collection("warehouses")
	_, err = whColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "code", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on warehouses.code: %v\n", err)
	}

	// Compound unique index on locations (warehouse_id, code)
	locColl := m.Database.Collection("locations")
	_, err = locColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "warehouse_id", Value: 1}, {Key: "code", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create compound unique index on locations: %v\n", err)
	}

	// Compound unique index on inventory_items (warehouse_id, location_id, product_id, variant_id)
	invColl := m.Database.Collection("inventory_items")
	_, err = invColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "warehouse_id", Value: 1},
			{Key: "location_id", Value: 1},
			{Key: "product_id", Value: 1},
			{Key: "variant_id", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create compound index on inventory_items: %v\n", err)
	}

	// Index on inventory_movements (warehouse_id, created_at)
	movColl := m.Database.Collection("inventory_movements")
	_, err = movColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "warehouse_id", Value: 1},
			{Key: "created_at", Value: -1},
		},
	})
	if err != nil {
		log.Printf("Warning: failed to create index on inventory_movements: %v\n", err)
	}

	// Unique index on suppliers.code
	supColl := m.Database.Collection("suppliers")
	_, err = supColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "code", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on suppliers.code: %v\n", err)
	}

	// Unique index on purchase_orders.order_number
	poColl := m.Database.Collection("purchase_orders")
	_, err = poColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "order_number", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on purchase_orders.order_number: %v\n", err)
	}

	// Unique index on customers.code
	custColl := m.Database.Collection("customers")
	_, err = custColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "code", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on customers.code: %v\n", err)
	}

	// Unique index on sales_orders.order_number
	soColl := m.Database.Collection("sales_orders")
	_, err = soColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "order_number", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("Warning: failed to create unique index on sales_orders.order_number: %v\n", err)
	}

	// TTL index on notifications.expires_at (expireAfterSeconds: 0) for automatic 3x24h (72h) expiration
	notifColl := m.Database.Collection("notifications")
	_, err = notifColl.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "expires_at", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(0),
	})
	if err != nil {
		log.Printf("Warning: failed to create TTL index on notifications.expires_at: %v\n", err)
	}

	log.Println("MongoDB indexes successfully ensured.")
	return nil
}

func (m *MongoDB) Disconnect(ctx context.Context) error {
	return m.Client.Disconnect(ctx)
}

// PurgeDummyData is disabled to ensure data is permanently retained.
func (m *MongoDB) PurgeDummyData(ctx context.Context) error {
	return nil
}
