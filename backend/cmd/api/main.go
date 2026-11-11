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
	"journal/internal/mailer"
	"journal/internal/mailer/resend"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/tvfeed"
	"journal/internal/yahoofeed"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}

	db, err := repository.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}

	signer := auth.NewSigner(cfg.JWTSecret, cfg.AccessTTL)
	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	// Một CashFlowRepo dùng chung cho cả CashFlowService lẫn TradeService:
	// TradeService cần cash flow để tính current_balance của /stats.
	cashFlowRepo := repository.NewCashFlowRepo(db)
	// TradeRepo dùng chung cho TradeService và ImportService: import ghi qua
	// CreateBatch của chính repo này để dãy stt liền một mối.
	tradeRepo := repository.NewTradeRepo(db)

	// Bộ đếm tần suất trong Postgres: chung cho mọi instance trên Vercel.
	counters := repository.NewCounterRepo(db)
	limiter := service.NewRateLimiter(counters)
	limiter.Disabled = cfg.RateLimitOff

	authSvc := service.NewAuthService(
		repository.NewUserRepo(db),
		repository.NewRefreshTokenRepo(db),
		signer,
		cfg.RefreshTTL,
	).WithLockout(counters)
	// Xác minh email (K-56): chỉ bật khi có đường gửi thư. Đã deploy mà thiếu
	// RESEND_API_KEY thì tắt hẳn, không khoá người dùng ngoài.
	switch cfg.MailMode {
	case config.MailResend:
		authSvc.WithEmailVerification(repository.NewEmailTokenRepo(db),
			resend.Client{APIKey: cfg.ResendAPIKey, From: cfg.MailFrom}, cfg.AppURL)
	case config.MailLog:
		authSvc.WithEmailVerification(repository.NewEmailTokenRepo(db), &mailer.LogMailer{}, cfg.AppURL)
	default:
		log.Printf("WARNING: RESEND_API_KEY is not set; email verification is disabled")
	}

	deps := httpapi.Deps{
		Auth:         authSvc,
		Limiter:      limiter,
		Account:      accountSvc,
		CashFlow:     service.NewCashFlowService(cashFlowRepo, accountSvc),
		Trade:        service.NewTradeService(tradeRepo, cashFlowRepo, accountSvc),
		Import:       service.NewImportService(tradeRepo),
		NoteTemplate: service.NewNoteTemplateService(repository.NewNoteTemplateRepo(db)),
		JournalNote:  service.NewJournalNoteService(repository.NewJournalNoteRepo(db)),
		Waitlist:     service.NewWaitlistService(repository.NewWaitlistRepo(db)),
		LiveBars:     service.NewLiveBarService(tvfeed.Client{}.Fetch, repository.NewReplayBarRepo(db), time.Now).WithYahoo(yahoofeed.Client{}.Fetch),
		CronSecret:   cfg.CronSecret,
		Signer:       signer,
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
