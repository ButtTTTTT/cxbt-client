package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func main() {
	log.Println("Starting cxbt-server (MySQL 8 + Redis) on ports :8081 and :8080...")

	// Initialize Database (MySQL 8 & Redis)
	InitDB()

	r := gin.Default()
	r.Use(CORSMiddleware())

	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong", "db": "MySQL 8"})
	})

	RegisterRoutes(r)
	RegisterPdeFeatureRoutes(r)
	RegisterVoiceAndLuaRoutes(r)
	r.GET("/ws", ServeWs)
	r.GET("/webrtc", ServeWebRTC)

	// Also listen on :8080 for backwards compatibility
	go func() {
		if err := r.Run(":8080"); err != nil {
			log.Printf("Note: secondary port :8080 listener stopped: %v", err)
		}
	}()

	if err := r.Run(":8081"); err != nil {
		log.Fatalf("Failed to run server on :8081: %v", err)
	}
}
