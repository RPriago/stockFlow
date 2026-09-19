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
)

type InventoryHandler struct {
	inventoryService service.InventoryService
}

func NewInventoryHandler(inventoryService service.InventoryService) *InventoryHandler {
	return &InventoryHandler{inventoryService: inventoryService}
}

func (h *InventoryHandler) ListInventory(c *gin.Context) {
	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)
	lowStockOnly, _ := strconv.ParseBool(c.DefaultQuery("low_stock", "false"))

	params := models.InventoryQueryParam{
		WarehouseID:  c.Query("warehouse_id"),
		LocationID:   c.Query("location_id"),
		ProductID:    c.Query("product_id"),
		LowStockOnly: lowStockOnly,
		Search:       c.Query("search"),
		Page:         page,
		Limit:        limit,
	}

	items, total, err := h.inventoryService.GetInventory(c.Request.Context(), params)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve inventory", err.Error())
		return
	}
	if items == nil {
		items = []models.InventoryItem{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Inventory retrieved successfully", gin.H{
		"items": items,
		"meta": gin.H{
			"total": total,
			"page":  page,
			"limit": limit,
		},
	})
}

func (h *InventoryHandler) GetStats(c *gin.Context) {
	stats, err := h.inventoryService.GetStats(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve inventory stats", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Inventory stats retrieved successfully", stats)
}

func (h *InventoryHandler) ListMovements(c *gin.Context) {
	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)

	params := models.MovementQueryParam{
		WarehouseID:  c.Query("warehouse_id"),
		ProductID:    c.Query("product_id"),
		MovementType: c.Query("movement_type"),
		Page:         page,
		Limit:        limit,
	}

	movements, total, err := h.inventoryService.GetMovements(c.Request.Context(), params)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve movement history", err.Error())
		return
	}
	if movements == nil {
		movements = []models.InventoryMovement{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Movement history retrieved successfully", gin.H{
		"movements": movements,
		"meta": gin.H{
			"total": total,
			"page":  page,
			"limit": limit,
		},
	})
}

func (h *InventoryHandler) StockIn(c *gin.Context) {
	var req models.StockInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Staff"
	}

	item, err := h.inventoryService.StockIn(c.Request.Context(), req, userID, userName)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Stock received successfully", item)
}

func (h *InventoryHandler) StockOut(c *gin.Context) {
	var req models.StockOutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Staff"
	}

	item, err := h.inventoryService.StockOut(c.Request.Context(), req, userID, userName)
	if err != nil {
		if errors.Is(err, repository.ErrInsufficientStock) {
			utils.ErrorResponse(c, http.StatusConflict, "Insufficient available stock at this location", nil)
			return
		}
		if errors.Is(err, repository.ErrInventoryNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "No stock found at this warehouse location", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Stock dispatched successfully", item)
}

func (h *InventoryHandler) AdjustStock(c *gin.Context) {
	var req models.StockAdjustmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Manager"
	}

	item, err := h.inventoryService.AdjustStock(c.Request.Context(), req, userID, userName)
	if err != nil {
		if errors.Is(err, repository.ErrCannotAdjustBelowReserved) {
			utils.ErrorResponse(c, http.StatusConflict, "Cannot adjust stock below currently reserved amount", nil)
			return
		}
		if errors.Is(err, repository.ErrInventoryNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Inventory item not found at this location", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Stock adjusted successfully", item)
}

func (h *InventoryHandler) GetStockFlowAnalytics(c *gin.Context) {
	period := c.DefaultQuery("period", "monthly")
	rangeParam := c.DefaultQuery("range", "")

	data, err := h.inventoryService.GetStockFlowAnalytics(c.Request.Context(), period, rangeParam)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve stock flow analytics", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Stock flow analytics retrieved successfully", data)
}

func (h *InventoryHandler) GetWarehouseCapacityAnalytics(c *gin.Context) {
	data, err := h.inventoryService.GetWarehouseCapacityAnalytics(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve warehouse capacity analytics", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Warehouse capacity analytics retrieved successfully", data)
}
