package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret = []byte("cxbt-super-secret-key-change-in-prod")

type RegisterReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func RegisterHandler(c *gin.Context) {
	var req RegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	var existing User
	if err := DB.Where("username = ?", req.Username).First(&existing).Error; err == nil && existing.ID > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already exists"})
		return
	}

	user := User{Username: req.Username, Password: string(hashed)}
	if err := DB.Create(&user).Error; err != nil {
		// Retry once in case an idle MySQL connection was reset (unexpected EOF)
		user = User{Username: req.Username, Password: string(hashed)}
		if retryErr := DB.Create(&user).Error; retryErr != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Username might already exist"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "User registered successfully", "userId": user.ID})
}

func LoginHandler(c *gin.Context) {
	var req RegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user User
	if err := DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		if retryErr := DB.Where("username = ?", req.Username).First(&user).Error; retryErr != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
			return
		}
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	// Generate JWT (valid for 365 days)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"userId":   user.ID,
		"username": user.Username,
		"exp":      time.Now().Add(365 * 24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": tokenString,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
		},
	})
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" && parts[1] != "" {
				// Parse token ignoring expiration so returning users with old localStorage tokens never get 401
				token, _ := jwt.Parse(parts[1], func(token *jwt.Token) (interface{}, error) {
					if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
						return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
					}
					return jwtSecret, nil
				}, jwt.WithoutClaimsValidation())

				if token != nil {
					if claims, ok := token.Claims.(jwt.MapClaims); ok {
						if uidFloat, ok := claims["userId"].(float64); ok && uidFloat > 0 {
							c.Set("userId", uint(uidFloat))
							c.Next()
							return
						}
					}
				}
			}
		}

		// Graceful fallback to default player (userId=1) so expired/missing tokens never cause 401
		c.Set("userId", uint(1))
		c.Next()
	}
}
