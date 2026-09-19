package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/database"
	"stockflow-backend/internal/handler"
	"stockflow-backend/internal/middleware"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("Starting StockFlow API on port :%s ...\n", cfg.Port)

	// 1. Initialize repository (MongoDB or In-Memory fallback)
	var userRepo repository.UserRepository
	var productRepo repository.ProductRepository
	var whRepo repository.WarehouseRepository
	var invRepo repository.InventoryRepository
	var poRepo repository.PORepository
	var soRepo repository.SORepository
	var notifRepo repository.NotificationRepository

	if cfg.UseInMemoryDB {
		log.Println("ℹ️  USE_IN_MEMORY_DB=true is enabled: Using In-Memory Database.")
		userRepo = repository.NewUserMemoryRepository()
		productRepo = repository.NewProductMemoryRepository()
		whRepo = repository.NewWarehouseMemoryRepository()
		invRepo = repository.NewMemoryInventoryRepository()
		poRepo = repository.NewMemoryPORepository()
		soRepo = repository.NewMemorySORepository()
		notifRepo = repository.NewNotificationMemoryRepository()
	} else {
		mongoDB, err := database.ConnectMongoDB(cfg.MongoURI, cfg.DBName)
		if err != nil {
			log.Printf("⚠️  Could not connect to MongoDB at %s: %v\n", cfg.MongoURI, err)
			log.Println("💡 [Auto-Fallback] Starting in IN-MEMORY mode so you can test the app immediately!")
			log.Println("💡 To use MongoDB Atlas, set MONGO_URI in backend/.env")
			userRepo = repository.NewUserMemoryRepository()
			productRepo = repository.NewProductMemoryRepository()
			whRepo = repository.NewWarehouseMemoryRepository()
			invRepo = repository.NewMemoryInventoryRepository()
			poRepo = repository.NewMemoryPORepository()
			soRepo = repository.NewMemorySORepository()
			notifRepo = repository.NewNotificationMemoryRepository()
		} else {
			defer func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := mongoDB.Disconnect(ctx); err != nil {
					log.Printf("Error disconnecting MongoDB: %v\n", err)
				}
			}()

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := mongoDB.EnsureIndexes(ctx); err != nil {
				log.Printf("Warning: failed to ensure indexes: %v\n", err)
			}
			userRepo = repository.NewUserRepository(mongoDB.Database)
			productRepo = repository.NewProductRepository(mongoDB.Database)
			whRepo = repository.NewWarehouseRepository(mongoDB.Database)
			invRepo = repository.NewInventoryRepository(mongoDB.Database)
			poRepo = repository.NewPORepository(mongoDB.Database)
			soRepo = repository.NewSORepository(mongoDB.Database)
			notifRepo = repository.NewNotificationRepository(mongoDB.Database)
		}
	}

	// 2. Initialize Service & Handlers
	authService := service.NewAuthService(userRepo, cfg)
	productService := service.NewProductService(productRepo)
	whService := service.NewWarehouseService(whRepo)
	invService := service.NewInventoryService(invRepo, productRepo, whRepo)
	poService := service.NewPOService(poRepo, productRepo, whRepo, invService)
	soService := service.NewSOService(soRepo, productRepo, whRepo, invService)
	notifService := service.NewNotificationService(notifRepo, productRepo, invRepo)

	// 3. Seed only Super Admin (no dummy catalog, warehouses, or orders)
	seedCtx, seedCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer seedCancel()

	if err := authService.SeedInitialAdmin(seedCtx); err != nil {
		log.Printf("Warning: failed to seed initial users: %v\n", err)
	}

	authHandler := handler.NewAuthHandler(authService, cfg)
	productHandler := handler.NewProductHandler(productService)
	whHandler := handler.NewWarehouseHandler(whService)
	invHandler := handler.NewInventoryHandler(invService)
	poHandler := handler.NewPOHandler(poService)
	soHandler := handler.NewSOHandler(soService)
	notifHandler := handler.NewNotificationHandler(notifService)

	// 5. Setup Gin Router
	router := gin.Default()

	// CORS
	router.Use(middleware.CORSMiddleware(cfg))

	// Health check
	router.GET("/health", func(c *gin.Context) {
		utils.SuccessResponse(c, http.StatusOK, "StockFlow API is healthy", gin.H{
			"status":    "UP",
			"timestamp": time.Now(),
			"version":   "1.0.0-mvp",
		})
	})

	// API v1 routes (with 15s in-memory caching to safeguard Atlas free tier)
	v1 := router.Group("/api/v1")
	v1.Use(middleware.CacheMiddleware(15 * time.Second))
	{
		// Auth routes
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/register", authHandler.PublicRegister)
			authGroup.POST("/logout", authHandler.Logout)

			// Protected auth routes
			authProtected := authGroup.Group("")
			authProtected.Use(middleware.AuthMiddleware(cfg))
			{
				authProtected.GET("/me", authHandler.GetMe)
			}
		}

		// User Management routes (RBAC protected)
		usersGroup := v1.Group("/users")
		usersGroup.Use(middleware.AuthMiddleware(cfg))
		{
			// Super Admin & Warehouse Manager can list users; ONLY Super Admin can create, update, delete
			usersGroup.GET("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), authHandler.ListUsers)
			usersGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin), authHandler.RegisterUser)
			usersGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin), authHandler.UpdateUser)
			usersGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin), authHandler.DeleteUser)
		}

		// Products routes
		productsGroup := v1.Group("/products")
		productsGroup.Use(middleware.AuthMiddleware(cfg))
		{
			productsGroup.GET("", productHandler.ListProducts)
			productsGroup.GET("/:id", productHandler.GetProductByID)
			productsGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.CreateProduct)
			productsGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.UpdateProduct)
			productsGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.DeleteProduct)
		}

		// Categories routes
		categoriesGroup := v1.Group("/categories")
		categoriesGroup.Use(middleware.AuthMiddleware(cfg))
		{
			categoriesGroup.GET("", productHandler.ListCategories)
			categoriesGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.CreateCategory)
		}

		// Warehouse routes
		whGroup := v1.Group("/warehouses")
		whGroup.Use(middleware.AuthMiddleware(cfg))
		{
			whGroup.GET("", whHandler.ListWarehouses)
			whGroup.GET("/:id", whHandler.GetWarehouseByID)
			whGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.CreateWarehouse)
			whGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.UpdateWarehouse)
			whGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.DeleteWarehouse)

			// Locations / Bins inside Warehouse
			whGroup.GET("/:id/locations", whHandler.ListLocations)
			whGroup.POST("/:id/locations", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.CreateLocation)
		}

		// Location direct routes
		locGroup := v1.Group("/locations")
		locGroup.Use(middleware.AuthMiddleware(cfg))
		{
			locGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.DeleteLocation)
		}

		// Inventory routes
		invGroup := v1.Group("/inventory")
		invGroup.Use(middleware.AuthMiddleware(cfg))
		{
			invGroup.GET("", invHandler.ListInventory)
			invGroup.GET("/stats", invHandler.GetStats)
			invGroup.GET("/movements", invHandler.ListMovements)
			invGroup.GET("/analytics/flow", invHandler.GetStockFlowAnalytics)
			invGroup.GET("/analytics/capacity", invHandler.GetWarehouseCapacityAnalytics)
			invGroup.POST("/stock-in", invHandler.StockIn)
			invGroup.POST("/stock-out", invHandler.StockOut)
			invGroup.POST("/adjust", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), invHandler.AdjustStock)
		}

		// Supplier routes
		supGroup := v1.Group("/suppliers")
		supGroup.Use(middleware.AuthMiddleware(cfg))
		{
			supGroup.GET("", poHandler.ListSuppliers)
			supGroup.GET("/:id", poHandler.GetSupplierByID)
			supGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.CreateSupplier)
			supGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.UpdateSupplier)
			supGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.DeleteSupplier)
		}

		// Purchase Order routes
		poGroup := v1.Group("/purchase-orders")
		poGroup.Use(middleware.AuthMiddleware(cfg))
		{
			poGroup.GET("", poHandler.ListPOs)
			poGroup.GET("/stats", poHandler.GetPOStats)
			poGroup.GET("/:id", poHandler.GetPOByID)
			poGroup.POST("", poHandler.CreatePO)
			poGroup.PUT("/:id", poHandler.UpdatePO)
			poGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.DeletePO)
			poGroup.POST("/:id/order", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.MarkOrdered)
			poGroup.POST("/:id/cancel", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.CancelPO)
			poGroup.POST("/:id/receive", poHandler.ReceivePO)
		}

		// Customer routes
		custGroup := v1.Group("/customers")
		custGroup.Use(middleware.AuthMiddleware(cfg))
		{
			custGroup.GET("", soHandler.ListCustomers)
			custGroup.GET("/:id", soHandler.GetCustomerByID)
			custGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager, models.RoleWarehouseStaff), soHandler.CreateCustomer)
			custGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.UpdateCustomer)
			custGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.DeleteCustomer)
		}

		// Sales Order routes
		soGroup := v1.Group("/sales-orders")
		soGroup.Use(middleware.AuthMiddleware(cfg))
		{
			soGroup.GET("", soHandler.ListSOs)
			soGroup.GET("/stats", soHandler.GetSOStats)
			soGroup.GET("/:id", soHandler.GetSOByID)
			soGroup.POST("", soHandler.CreateSO)
			soGroup.PUT("/:id", soHandler.UpdateSO)
			soGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.DeleteSO)
			soGroup.POST("/:id/confirm", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.ConfirmSO)
			soGroup.POST("/:id/picking", soHandler.StartPicking)
			soGroup.POST("/:id/packing", soHandler.StartPacking)
			soGroup.POST("/:id/dispatch", soHandler.DispatchSO)
			soGroup.POST("/:id/deliver", soHandler.DeliverSO)
			soGroup.POST("/:id/cancel", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.CancelSO)
		}

		// Notification routes
		notifGroup := v1.Group("/notifications")
		notifGroup.Use(middleware.AuthMiddleware(cfg))
		{
			notifGroup.GET("", notifHandler.GetNotifications)
			notifGroup.PATCH("/:id/read", notifHandler.MarkAsRead)
			notifGroup.POST("/mark-all-read", notifHandler.MarkAllAsRead)
			notifGroup.DELETE("/:id", notifHandler.DeleteNotification)
			notifGroup.DELETE("", notifHandler.ClearReadNotifications)
		}

		// Super Admin specific diagnostic route
		adminGroup := v1.Group("/admin")
		adminGroup.Use(middleware.AuthMiddleware(cfg), middleware.RequireRoles(models.RoleSuperAdmin))
		{
			adminGroup.GET("/diagnostics", func(c *gin.Context) {
				utils.SuccessResponse(c, http.StatusOK, "Super Admin access verified", gin.H{
					"role":        c.GetString(middleware.ContextRole),
					"user_id":     c.GetString(middleware.ContextUserID),
					"admin_email": c.GetString(middleware.ContextEmail),
				})
			})
		}
	}

	// 6. Start HTTP server with graceful shutdown
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server listen error: %v\n", err)
		}
	}()

	log.Printf("StockFlow API is successfully listening on port %s\n", cfg.Port)

	// Graceful shutdown handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down StockFlow API server...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v\n", err)
	}

	log.Println("Server exiting gracefully")
}
