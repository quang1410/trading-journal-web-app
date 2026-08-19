package main

import (
	"log"
	"net/http"
	"time"

	// tzdata nhúng cơ sở dữ liệu timezone vào binary. Ảnh distroless không có
	// /usr/share/zoneinfo, thiếu dòng này thì time.LoadLocation("Asia/Ho_Chi_Minh")
	// sẽ lỗi trong container và mọi phép gom nhóm theo ngày sẽ hỏng.
	_ "time/tzdata"

	"journal/internal/config"
	"journal/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("cấu hình không hợp lệ: %v", err)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.NewRouter(httpapi.Deps{}),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("journal-api listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
