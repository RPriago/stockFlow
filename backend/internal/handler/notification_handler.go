package handler

import (
	"errors"
	"net/http"

	"stockflow-backend/internal/repository"
	"stockflow-backend/internal/service"
	"stockflow-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NotificationHandler struct {
	notifService service.NotificationService
}

func NewNotificationHandler(notifService service.NotificationService) *NotificationHandler {
	return &NotificationHandler{notifService: notifService}
}

func (h *NotificationHandler) GetNotifications(c *gin.Context) {
	summary, err := h.notifService.GetNotifications(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve notifications", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Notifications retrieved successfully", summary)
}

func (h *NotificationHandler) MarkAsRead(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid notification ID format", nil)
		return
	}

	err = h.notifService.MarkAsRead(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotificationNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Notification not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to mark notification as read", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Notification marked as read", nil)
}

func (h *NotificationHandler) MarkAllAsRead(c *gin.Context) {
	err := h.notifService.MarkAllAsRead(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to mark all notifications as read", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "All notifications marked as read", nil)
}

func (h *NotificationHandler) DeleteNotification(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid notification ID format", nil)
		return
	}

	err = h.notifService.DeleteNotification(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotificationNotFound) {
			utils.ErrorResponse(c, http.StatusNotFound, "Notification not found", nil)
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete notification", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Notification deleted successfully", nil)
}

func (h *NotificationHandler) ClearReadNotifications(c *gin.Context) {
	err := h.notifService.ClearReadNotifications(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to clear read notifications", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Read notifications cleared successfully", nil)
}
