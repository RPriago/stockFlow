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

type SOHandler struct {
	soService service.SOService
}

func NewSOHandler(soService service.SOService) *SOHandler {
	return &SOHandler{soService: soService}
}

// Customer handlers
func (h *SOHandler) ListCustomers(c *gin.Context) {
	customers, err := h.soService.ListCustomers(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to list customers", err.Error())
		return
	}
	if customers == nil {
		customers = []models.Customer{}
	}
	utils.SuccessResponse(c, http.StatusOK, "Customers retrieved successfully", customers)
}

func (h *SOHandler) GetCustomerByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid customer ID format", nil)
		return
	}

	customer, err := h.soService.GetCustomerByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrCustomerNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Customer not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get customer", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Customer retrieved successfully", customer)
}

func (h *SOHandler) CreateCustomer(c *gin.Context) {
	var req models.CreateCustomerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	customer, err := h.soService.CreateCustomer(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, repository.ErrCustomerCodeExists) {
			utils.ErrorResponse(c, http.StatusConflict, "Customer with this code already exists", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "Customer created successfully", customer)
}

func (h *SOHandler) UpdateCustomer(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid customer ID format", nil)
		return
	}

	var req models.UpdateCustomerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	customer, err := h.soService.UpdateCustomer(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrCustomerNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Customer not found", nil)
			return
		}
		if errors.Is(err, repository.ErrCustomerCodeExists) {
			utils.ErrorResponse(c, http.StatusConflict, "Customer code already exists", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Customer updated successfully", customer)
}

func (h *SOHandler) DeleteCustomer(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid customer ID format", nil)
		return
	}

	if err := h.soService.DeleteCustomer(c.Request.Context(), id); err != nil {
		if errors.Is(err, repository.ErrCustomerNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Customer not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete customer", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Customer deleted successfully", nil)
}

// Sales Order handlers
func (h *SOHandler) ListSOs(c *gin.Context) {
	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)

	params := models.SOQueryParam{
		Status:      c.Query("status"),
		CustomerID:  c.Query("customer_id"),
		WarehouseID: c.Query("warehouse_id"),
		Search:      c.Query("search"),
		Page:        page,
		Limit:       limit,
	}

	orders, total, err := h.soService.ListSOs(c.Request.Context(), params)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to list sales orders", err.Error())
		return
	}
	if orders == nil {
		orders = []models.SalesOrder{}
	}

	utils.SuccessResponse(c, http.StatusOK, "Sales orders retrieved successfully", gin.H{
		"orders": orders,
		"meta": gin.H{
			"total": total,
			"page":  page,
			"limit": limit,
		},
	})
}

func (h *SOHandler) GetSOByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	so, err := h.soService.GetSOByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get sales order", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order retrieved successfully", so)
}

func (h *SOHandler) GetSOStats(c *gin.Context) {
	stats, err := h.soService.GetSOStats(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get sales order stats", err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order stats retrieved successfully", stats)
}

func (h *SOHandler) CreateSO(c *gin.Context) {
	var req models.CreateSORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Staff"
	}

	so, err := h.soService.CreateSO(c.Request.Context(), req, userID, userName)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "Sales order created successfully", so)
}

func (h *SOHandler) UpdateSO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	var req models.UpdateSORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	so, err := h.soService.UpdateSO(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrSOAlreadyLocked) {
			utils.ErrorResponse(c, http.StatusConflict, "Cannot update sales order: only draft orders can be modified", nil)
			return
		}
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order updated successfully", so)
}

func (h *SOHandler) ConfirmSO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	so, err := h.soService.ConfirmSO(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order confirmed and stock reserved successfully", so)
}

func (h *SOHandler) StartPicking(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	so, err := h.soService.StartPicking(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order moved to picking status", so)
}

func (h *SOHandler) StartPacking(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	so, err := h.soService.StartPacking(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order moved to packing status", so)
}

func (h *SOHandler) DispatchSO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	var req models.DispatchSORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Staff"
	}

	so, err := h.soService.DispatchSO(c.Request.Context(), id, req, userID, userName)
	if err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order dispatched and physical stock deducted successfully", so)
}

func (h *SOHandler) DeliverSO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	so, err := h.soService.DeliverSO(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order marked as delivered", so)
}

func (h *SOHandler) CancelSO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	userID := c.GetString(middleware.ContextUserID)
	userName := c.GetString(middleware.ContextName)
	if userName == "" {
		userName = "Staff"
	}

	so, err := h.soService.CancelSO(c.Request.Context(), id, userID, userName)
	if err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order cancelled and reserved stock released", so)
}

func (h *SOHandler) DeleteSO(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	if err := h.soService.DeleteSO(c.Request.Context(), id); err != nil {
		if errors.Is(err, repository.ErrSONotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Sales order not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Sales order deleted successfully", nil)
}
