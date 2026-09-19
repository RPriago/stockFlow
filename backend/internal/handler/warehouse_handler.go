package handler

import (
	"errors"
	"net/http"

	"stockflow-backend/internal/models"
	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type WarehouseHandler struct {
	warehouseService service.WarehouseService
}

func NewWarehouseHandler(warehouseService service.WarehouseService) *WarehouseHandler {
	return &WarehouseHandler{warehouseService: warehouseService}
}

func (h *WarehouseHandler) ListWarehouses(c *gin.Context) {
	warehouses, err := h.warehouseService.ListWarehouses(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to list warehouses", err.Error())
		return
	}
	if warehouses == nil {
		warehouses = []models.Warehouse{}
	}
	utils.SuccessResponse(c, http.StatusOK, "Warehouses retrieved successfully", warehouses)
}

func (h *WarehouseHandler) GetWarehouseByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid warehouse ID format", nil)
		return
	}

	wh, err := h.warehouseService.GetWarehouseByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrWarehouseNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Warehouse not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get warehouse", err.Error())
		return
	}

	// Also fetch its locations
	locations, _ := h.warehouseService.ListLocations(c.Request.Context(), id)

	utils.SuccessResponse(c, http.StatusOK, "Warehouse details retrieved", gin.H{
		"warehouse": wh,
		"locations": locations,
	})
}

func (h *WarehouseHandler) CreateWarehouse(c *gin.Context) {
	var req models.CreateWarehouseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	wh, err := h.warehouseService.CreateWarehouse(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, repository.ErrWarehouseCodeExists) {
			utils.ErrorResponse(c, http.StatusConflict, "Warehouse code already exists", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Warehouse created successfully", wh)
}

func (h *WarehouseHandler) UpdateWarehouse(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid warehouse ID format", nil)
		return
	}

	var req models.UpdateWarehouseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	wh, err := h.warehouseService.UpdateWarehouse(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrWarehouseNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Warehouse not found", nil)
			return
		}
		if errors.Is(err, repository.ErrWarehouseCodeExists) {
			utils.ErrorResponse(c, http.StatusConflict, "Warehouse code already in use", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Warehouse updated successfully", wh)
}

func (h *WarehouseHandler) DeleteWarehouse(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid warehouse ID format", nil)
		return
	}

	err = h.warehouseService.DeleteWarehouse(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrWarehouseNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Warehouse not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete warehouse", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Warehouse deleted successfully", nil)
}

func (h *WarehouseHandler) ListLocations(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid warehouse ID format", nil)
		return
	}

	locations, err := h.warehouseService.ListLocations(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to list locations", err.Error())
		return
	}
	if locations == nil {
		locations = []models.Location{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Locations retrieved successfully", locations)
}

func (h *WarehouseHandler) CreateLocation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid warehouse ID format", nil)
		return
	}

	var req models.CreateLocationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ValidationErrorResponse(c, err)
		return
	}

	loc, err := h.warehouseService.CreateLocation(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrLocationCodeExists) {
			utils.ErrorResponse(c, http.StatusConflict, "A location bin with this code already exists in this warehouse", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Storage location bin created successfully", loc)
}

func (h *WarehouseHandler) DeleteLocation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid location ID format", nil)
		return
	}

	err = h.warehouseService.DeleteLocation(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrLocationNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Location not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete location", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Storage location bin deleted successfully", nil)
}
