package handler

import (
	"errors"
	"net/http"
	"strconv"

	"stockflow-backend/internal/middleware"
	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ProductHandler struct {
	productService service.ProductService
}

func NewProductHandler(productService service.ProductService) *ProductHandler {
	return &ProductHandler{
		productService: productService,
	}
}

func (h *ProductHandler) ListProducts(c *gin.Context) {
	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "10"), 10, 64)
	search := c.Query("search")
	categoryID := c.Query("category_id")
	lowStockOnly, _ := strconv.ParseBool(c.DefaultQuery("low_stock", "false"))

	params := models.ProductQueryParam{
		Search:       search,
		CategoryID:   categoryID,
		LowStockOnly: lowStockOnly,
		Page:         page,
		Limit:        limit,
	}

	products, total, err := h.productService.ListProducts(c.Request.Context(), params)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch products", err.Error())
		return
	}
	if products == nil {
		products = []models.Product{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Products retrieved successfully", gin.H{
		"products": products,
		"meta": gin.H{
			"total": total,
			"page":  page,
			"limit": limit,
		},
	})
}

func (h *ProductHandler) GetProductByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid product ID format", nil)
		return
	}

	product, err := h.productService.GetProductByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrProductNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Product not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get product details", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Product details retrieved", product)
}

func (h *ProductHandler) CreateProduct(c *gin.Context) {
	var req models.CreateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	createdBy := c.GetString(middleware.ContextEmail)
	if createdBy == "" {
		createdBy = "admin"
	}

	product, err := h.productService.CreateProduct(c.Request.Context(), req, createdBy)
	if err != nil {
		if errors.Is(err, repository.ErrProductSKUExists) {
			utils.ErrorResponse(c, http.StatusConflict, "A product with this SKU already exists", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Product created successfully", product)
}

func (h *ProductHandler) UpdateProduct(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid product ID format", nil)
		return
	}

	var req models.UpdateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	updated, err := h.productService.UpdateProduct(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrProductNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Product not found", nil)
			return
		}
		if errors.Is(err, repository.ErrProductSKUExists) {
			utils.ErrorResponse(c, http.StatusConflict, "Another product is already using this SKU", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Product updated successfully", updated)
}

func (h *ProductHandler) DeleteProduct(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid product ID format", nil)
		return
	}

	err = h.productService.DeleteProduct(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrProductNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Product not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete product", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Product deleted successfully", nil)
}

func (h *ProductHandler) ListCategories(c *gin.Context) {
	categories, err := h.productService.ListCategories(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to list categories", err.Error())
		return
	}
	if categories == nil {
		categories = []models.Category{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Categories retrieved successfully", categories)
}

func (h *ProductHandler) CreateCategory(c *gin.Context) {
	var req models.CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	category, err := h.productService.CreateCategory(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, repository.ErrCategoryAlreadyExist) {
			utils.ErrorResponse(c, http.StatusConflict, "Category already exists", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Category created successfully", category)
}
