package controllers

import (
	"net/http"
	"strconv"

	"admin-api/internal/services"
	"admin-api/shared/models"
	"github.com/gin-gonic/gin"
)

type AdminController struct {
	adminService *services.AdminService
}

func NewAdminController() *AdminController {
	return &AdminController{
		adminService: services.NewAdminService(),
	}
}

// Login 管理员登录
func (ctrl *AdminController) Login(c *gin.Context) {
	var req models.AdminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "请求参数错误",
			"details": err.Error(),
		})
		return
	}

	resp, err := ctrl.adminService.Login(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "登录成功",
		"data": resp,
	})
}

// GetProfile 获取当前管理员信息
func (ctrl *AdminController) GetProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "未找到用户信息",
		})
		return
	}

	admin, err := ctrl.adminService.GetAdminByID(userID.(uint))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": admin,
	})
}

// GetAllAdmins 获取所有管理员
func (ctrl *AdminController) GetAllAdmins(c *gin.Context) {
	admins, err := ctrl.adminService.GetAllAdmins()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "获取管理员列表失败",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": admins,
	})
}

// GetAdminByID 根据ID获取管理员
func (ctrl *AdminController) GetAdminByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的管理员ID",
		})
		return
	}

	admin, err := ctrl.adminService.GetAdminByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": admin,
	})
}

// CreateAdmin 创建管理员
func (ctrl *AdminController) CreateAdmin(c *gin.Context) {
	var req models.AdminCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "请求参数错误",
			"details": err.Error(),
		})
		return
	}

	admin, err := ctrl.adminService.CreateAdmin(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "创建成功",
		"data": admin,
	})
}

// UpdateAdmin 更新管理员
func (ctrl *AdminController) UpdateAdmin(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的管理员ID",
		})
		return
	}

	var req models.AdminUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "请求参数错误",
			"details": err.Error(),
		})
		return
	}

	admin, err := ctrl.adminService.UpdateAdmin(uint(id), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "更新成功",
		"data": admin,
	})
}

// DeleteAdmin 删除管理员
func (ctrl *AdminController) DeleteAdmin(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的管理员ID",
		})
		return
	}

	err = ctrl.adminService.DeleteAdmin(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "删除成功",
	})
}

// ChangePassword 修改密码
func (ctrl *AdminController) ChangePassword(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "未找到用户信息",
		})
		return
	}

	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "请求参数错误",
			"details": err.Error(),
		})
		return
	}

	err := ctrl.adminService.ChangePassword(userID.(uint), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "密码修改成功",
	})
}

// GetStats 获取仪表盘统计数据
func (ctrl *AdminController) GetStats(c *gin.Context) {
	stats, err := ctrl.adminService.GetDashboardStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "获取统计数据失败",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取统计数据成功",
		"data": stats,
	})
}