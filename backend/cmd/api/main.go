package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"stockflow-backend/internal/config"
	"stockflow-backend/internal/database"
	"stockflow-backend/internal/events"
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

	// 4. Initialize Rate Limiters
	authLimiter := middleware.NewRateLimiter(10, time.Minute)
	defer authLimiter.Close()
	apiLimiter := middleware.NewRateLimiter(120, time.Minute)
	defer apiLimiter.Close()

	// 5. Setup Gin Router
	router := gin.Default()

	// SEC-001: Configure trusted proxies to prevent client IP spoofing via X-Forwarded-For
	if cfg.TrustedProxies != "" {
		proxies := strings.Split(cfg.TrustedProxies, ",")
		for i := range proxies {
			proxies[i] = strings.TrimSpace(proxies[i])
		}
		if err := router.SetTrustedProxies(proxies); err != nil {
			log.Printf("Warning: failed to set trusted proxies: %v\n", err)
		}
	} else {
		// In standalone/direct deployment, trust no upstream proxies so c.ClientIP() cannot be spoofed
		_ = router.SetTrustedProxies(nil)
	}

	// Security response headers (OWASP best practices: XSS, Clickjacking, MIME-sniffing, HSTS)
	router.Use(middleware.SecurityHeadersMiddleware())

	// Request body size limit (2 MB max to defend against DoS payload exhaustion)
	router.Use(middleware.BodyLimitMiddleware(2 << 20))

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

	// API v1 routes (protected by general API rate limiting and CSRF verification)
	authMid := middleware.AuthMiddleware(cfg, userRepo)

	v1 := router.Group("/api/v1")
	v1.Use(apiLimiter.Middleware())
	v1.Use(middleware.CSRFProtectionMiddleware(cfg))
	{
		// Real-time events SSE stream (Protected by AuthMiddleware)
		v1.GET("/events", authMid, func(c *gin.Context) {
			events.GetBroker().ServeHTTP(c)
		})

		// Auth routes (protected by dedicated AuthRateLimiter against brute force & credential stuffing)
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/login", authLimiter.Middleware(), authHandler.Login)
			authGroup.POST("/register", authLimiter.Middleware(), authHandler.PublicRegister)
			authGroup.POST("/logout", authHandler.Logout)

			// Protected auth routes
			authProtected := authGroup.Group("")
			authProtected.Use(authMid)
			{
				authProtected.GET("/me", authHandler.GetMe)
			}
		}

		// Authenticated API routes with Response Cache (Cache is evaluated AFTER Auth validation)
		apiAuth := v1.Group("")
		apiAuth.Use(authMid)
		apiAuth.Use(middleware.CacheMiddleware(15 * time.Second))
		{
			// User Management routes (RBAC protected)
			usersGroup := apiAuth.Group("/users")
			{
				usersGroup.GET("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), authHandler.ListUsers)
				usersGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin), authHandler.RegisterUser)
				usersGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin), authHandler.UpdateUser)
				usersGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin), authHandler.DeleteUser)
			}

			// Products routes
			productsGroup := apiAuth.Group("/products")
			{
				productsGroup.GET("", productHandler.ListProducts)
				productsGroup.GET("/:id", productHandler.GetProductByID)
				productsGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.CreateProduct)
				productsGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.UpdateProduct)
				productsGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.DeleteProduct)
			}

			// Categories routes
			categoriesGroup := apiAuth.Group("/categories")
			{
				categoriesGroup.GET("", productHandler.ListCategories)
				categoriesGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), productHandler.CreateCategory)
			}

			// Warehouse routes
			whGroup := apiAuth.Group("/warehouses")
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
			locGroup := apiAuth.Group("/locations")
			{
				locGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), whHandler.DeleteLocation)
			}

			// Inventory routes
			invGroup := apiAuth.Group("/inventory")
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
			supGroup := apiAuth.Group("/suppliers")
			{
				supGroup.GET("", poHandler.ListSuppliers)
				supGroup.GET("/:id", poHandler.GetSupplierByID)
				supGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.CreateSupplier)
				supGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.UpdateSupplier)
				supGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.DeleteSupplier)
			}

			// Purchase Order routes
			poGroup := apiAuth.Group("/purchase-orders")
			{
				poGroup.GET("", poHandler.ListPOs)
				poGroup.GET("/stats", poHandler.GetPOStats)
				poGroup.GET("/:id", poHandler.GetPOByID)
				poGroup.POST("", poHandler.CreatePO)
				poGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.UpdatePO)
				poGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.DeletePO)
				poGroup.POST("/:id/order", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.MarkOrdered)
				poGroup.POST("/:id/cancel", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), poHandler.CancelPO)
				poGroup.POST("/:id/receive", poHandler.ReceivePO)
			}

			// Customer routes
			custGroup := apiAuth.Group("/customers")
			{
				custGroup.GET("", soHandler.ListCustomers)
				custGroup.GET("/:id", soHandler.GetCustomerByID)
				custGroup.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager, models.RoleWarehouseStaff), soHandler.CreateCustomer)
				custGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.UpdateCustomer)
				custGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.DeleteCustomer)
			}

			// Sales Order routes
			soGroup := apiAuth.Group("/sales-orders")
			{
				soGroup.GET("", soHandler.ListSOs)
				soGroup.GET("/stats", soHandler.GetSOStats)
				soGroup.GET("/:id", soHandler.GetSOByID)
				soGroup.POST("", soHandler.CreateSO)
				soGroup.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.UpdateSO)
				soGroup.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.DeleteSO)
				soGroup.POST("/:id/confirm", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.ConfirmSO)
				soGroup.POST("/:id/picking", soHandler.StartPicking)
				soGroup.POST("/:id/packing", soHandler.StartPacking)
				soGroup.POST("/:id/dispatch", soHandler.DispatchSO)
				soGroup.POST("/:id/deliver", soHandler.DeliverSO)
				soGroup.POST("/:id/cancel", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleWarehouseManager), soHandler.CancelSO)
			}

			// Notification routes
			notifGroup := apiAuth.Group("/notifications")
			{
				notifGroup.GET("", notifHandler.GetNotifications)
				notifGroup.PATCH("/:id/read", notifHandler.MarkAsRead)
				notifGroup.POST("/mark-all-read", notifHandler.MarkAllAsRead)
				notifGroup.DELETE("/:id", notifHandler.DeleteNotification)
				notifGroup.DELETE("", notifHandler.ClearReadNotifications)
			}

			// Super Admin specific diagnostic route
			adminGroup := apiAuth.Group("/admin")
			adminGroup.Use(middleware.RequireRoles(models.RoleSuperAdmin))
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
	}

	// 6. Start HTTP server with graceful shutdown and Slowloris timeout protection
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
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
