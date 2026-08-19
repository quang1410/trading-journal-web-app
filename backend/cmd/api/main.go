package main

import (
	"log"
	"net/http"
	"time"

	// tzdata nhúng cơ sở dữ liệu timezone vào binary. Ảnh distroless không có
	// /usr/share/zoneinfo, thiếu dòng này thì time.LoadLocation("Asia/Ho_Chi_Minh")
	// sẽ lỗi trong container và mọi phép gom nhóm theo ngày sẽ hỏng.
	_ "time/tzdata"

	"journal/internal/auth"
	"journal/internal/config"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("cấu hình không hợp lệ: %v", err)
	}

	db, err := repository.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("kết nối database: %v", err)
	}

	signer := auth.NewSigner(cfg.JWTSecret, cfg.AccessTTL)
	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	deps := httpapi.Deps{
		Auth: service.NewAuthService(
			repository.NewUserRepo(db),
			repository.NewRefreshTokenRepo(db),
			signer,
			cfg.RefreshTTL,
		),
		Account:  accountSvc,
		CashFlow: service.NewCashFlowService(repository.NewCashFlowRepo(db), accountSvc),
		Signer:   signer,
		// Cookie Secure chỉ bật ở prod: dev chạy http nên bật lên là trình
		// duyệt lặng lẽ bỏ cookie.
		Secure:      cfg.Env == "prod",
		CORSOrigins: cfg.CORSOrigins,
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.NewRouter(deps),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("journal-api listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
