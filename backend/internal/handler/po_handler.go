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

type POHandler struct {
	poService service.POService
}

func NewPOHandler(poService service.POService) *POHandler {
	return &POHandler{poService: poService}
}

// Supplier handlers
func (h *POHandler) ListSuppliers(c *gin.Context) {
	suppliers, err := h.poService.ListSuppliers(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to list suppliers", err.Error())
		return
	}
	if suppliers == nil {
		suppliers = []models.Supplier{}
	}
	utils.SuccessResponse(c, http.StatusOK, "Suppliers retrieved successfully", suppliers)
}

func (h *POHandler) GetSupplierByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid supplier ID format", nil)
		return
	}

	supplier, err := h.poService.GetSupplierByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrSupplierNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Supplier not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get supplier", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Supplier retrieved successfully", supplier)
}

func (h *POHandler) CreateSupplier(c *gin.Context) {
	var req models.CreateSupplierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	supplier, err := h.poService.CreateSupplier(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, repository.ErrSupplierCodeExists) {
			utils.ErrorResponse(c, http.StatusConflict, "Supplier with this code already exists", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "Supplier created successfully", supplier)
}

func (h *POHandler) UpdateSupplier(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid supplier ID format", nil)
		return
	}

	var req models.UpdateSupplierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	supplier, err := h.poService.UpdateSupplier(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrSupplierNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Supplier not found", nil)
			return
		}
		if errors.Is(err, repository.ErrSupplierCodeExists) {
			utils.ErrorResponse(c, http.StatusConflict, "Supplier code already exists", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Supplier updated successfully", supplier)
}

func (h *POHandler) DeleteSupplier(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid supplier ID format", nil)
		return
	}

	if err := h.poService.DeleteSupplier(c.Request.Context(), id); err != nil {
		if errors.Is(err, repository.ErrSupplierNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Supplier not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete supplier", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Supplier deleted successfully", nil)
}

// Purchase Order handlers
func (h *POHandler) ListPOs(c *gin.Context) {
	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)

	params := models.POQueryParam{
		Status:      c.Query("status"),
		SupplierID:  c.Query("supplier_id"),
		WarehouseID: c.Query("warehouse_id"),
		Search:      c.Query("search"),
		Page:        page,
		Limit:       limit,
	}

	orders, total, err := h.poService.ListPOs(c.Request.Context(), params)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to list purchase orders", err.Error())
		return
	}
	if orders == nil {
		orders = []models.PurchaseOrder{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Purchase orders retrieved successfully", gin.H{
		"orders": orders,
		"meta": gin.H{
			"total": total,
			"page":  page,
			"limit": limit,
		},
	})
}

func (h *POHandler) GetPOByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	po, err := h.poService.GetPOByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrPONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Purchase order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get purchase order", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Purchase order retrieved successfully", po)
}

func (h *POHandler) GetPOStats(c *gin.Context) {
	stats, err := h.poService.GetPOStats(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get purchase order stats", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Purchase order stats retrieved successfully", stats)
}

func (h *POHandler) CreatePO(c *gin.Context) {
	var req models.CreatePORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Staff"
	}

	po, err := h.poService.CreatePO(c.Request.Context(), req, userID, userName)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "Purchase order created successfully", po)
}

func (h *POHandler) UpdatePO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	var req models.UpdatePORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	po, err := h.poService.UpdatePO(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrPOAlreadyLocked) {
			utils.ErrorResponse(c, http.StatusConflict, "Cannot update purchase order: only draft orders can be modified", nil)
			return
		}
		if errors.Is(err, repository.ErrPONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Purchase order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Purchase order updated successfully", po)
}

func (h *POHandler) MarkOrdered(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	po, err := h.poService.MarkOrdered(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrPONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Purchase order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Purchase order marked as ordered", po)
}

func (h *POHandler) CancelPO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	po, err := h.poService.CancelPO(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrPONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Purchase order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Purchase order cancelled successfully", po)
}

func (h *POHandler) DeletePO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	if err := h.poService.DeletePO(c.Request.Context(), id); err != nil {
		if errors.Is(err, repository.ErrPONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Purchase order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Purchase order deleted successfully", nil)
}

func (h *POHandler) ReceivePO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	var req models.ReceivePORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Staff"
	}

	po, err := h.poService.ReceivePO(c.Request.Context(), id, req, userID, userName)
	if err != nil {
		if errors.Is(err, repository.ErrPONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Purchase order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Goods received and stocked into warehouse successfully", po)
}
