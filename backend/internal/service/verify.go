package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/domain"
	"journal/internal/mailer"
	"journal/internal/repository"
)

// Xác minh email (K-56).

// VerifyTokenTTL là tuổi thọ của link xác minh.
const VerifyTokenTTL = 24 * time.Hour

// VerifyGracePeriod là thời gian dùng app khi chưa xác minh, tính từ lúc đăng ký.
const VerifyGracePeriod = 7 * 24 * time.Hour

// Cùng một câu cho token sai, hết hạn hay đã dùng: không cho dò lý do.
const msgInvalidVerifyLink = "liên kết xác minh không hợp lệ hoặc đã hết hạn"

type emailVerification struct {
	tokens EmailTokenStore
	mail   mailer.Mailer
	appURL string
}

// WithEmailVerification bật gửi thư và xác minh email. Không gọi thì không có
// thư nào được gửi và không ai bị chặn vì chưa xác minh.
func (s *AuthService) WithEmailVerification(tokens EmailTokenStore, m mailer.Mailer, appURL string) *AuthService {
	s.verify = &emailVerification{tokens: tokens, mail: m, appURL: strings.TrimRight(appURL, "/")}
	return s
}

// VerificationEnabled báo xác minh email có đang bật không.
func (s *AuthService) VerificationEnabled() bool { return s.verify != nil }

// sendVerification sinh token mới, lưu hash, rồi gửi thư. Lỗi trả về là lỗi
// hạ tầng (chưa dịch sang apperr).
func (s *AuthService) sendVerification(ctx context.Context, user repository.UserRow, locale string) error {
	raw, err := auth.NewRefreshToken()
	if err != nil {
		return fmt.Errorf("generate verify token: %w", err)
	}
	expires := s.Now().Add(VerifyTokenTTL)
	if err := s.verify.tokens.Create(ctx, user.ID, TokenPurposeVerify, auth.HashRefreshToken(raw), expires); err != nil {
		return fmt.Errorf("save verify token: %w", err)
	}
	link := s.verify.appURL + "/verify-email?token=" + url.QueryEscape(raw)
	if err := s.verify.mail.Send(ctx, mailer.VerifyEmail(user.Email, locale, link)); err != nil {
		return fmt.Errorf("send verify email: %w", err)
	}
	return nil
}

// RequestVerification gửi lại thư xác minh, bằng ngôn ngữ giao diện hiện tại
// (locale) thay vì ngôn ngữ lúc đăng ký.
func (s *AuthService) RequestVerification(ctx context.Context, userID int64, locale string) error {
	if s.verify == nil {
		return errors.New("email verification is disabled")
	}
	user, err := s.users.ByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.Unauthorized(msgInvalidSession)
		}
		return fmt.Errorf("find user: %w", err)
	}
	if user.EmailVerifiedAt != nil {
		return apperr.Conflict("email đã được xác minh")
	}
	if err := s.sendVerification(ctx, user, domain.NormalizeLocale(locale)); err != nil {
		// FailErr không log lỗi nghiệp vụ, nên lỗi gốc của nhà cung cấp phải
		// được ghi ở đây, không thì 502 không để lại dấu vết nào.
		log.Printf("resend verification email (user_id=%d): %v", user.ID, err)
		return apperr.BadGateway("không gửi được email, thử lại sau")
	}
	return nil
}

// VerifyEmail tiêu thụ token trong link. Công khai: link có thể mở ở một
// trình duyệt chưa đăng nhập.
func (s *AuthService) VerifyEmail(ctx context.Context, rawToken string) error {
	if s.verify == nil {
		return errors.New("email verification is disabled")
	}
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return apperr.Validation(msgInvalidVerifyLink)
	}
	_, err := s.verify.tokens.ConsumeVerify(ctx, auth.HashRefreshToken(rawToken), s.Now())
	if errors.Is(err, repository.ErrNotFound) {
		return apperr.Validation(msgInvalidVerifyLink)
	}
	if err != nil {
		return fmt.Errorf("consume verify token: %w", err)
	}
	return nil
}

// Me là thông tin của user đang đăng nhập.
type Me struct {
	ID            int64
	Email         string
	Locale        string
	EmailVerified bool
	// VerifyDeadline: hạn xác minh. nil khi đã xác minh hoặc không bật xác minh.
	VerifyDeadline *time.Time
	// VerificationRequired: đã quá hạn mà chưa xác minh → route dữ liệu bị chặn.
	VerificationRequired bool
}

func (s *AuthService) Me(ctx context.Context, userID int64) (Me, error) {
	user, err := s.users.ByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return Me{}, apperr.Unauthorized(msgInvalidSession)
		}
		return Me{}, fmt.Errorf("find user: %w", err)
	}
	me := Me{ID: user.ID, Email: user.Email, Locale: user.Locale, EmailVerified: user.EmailVerifiedAt != nil}
	if s.verify != nil && !me.EmailVerified {
		deadline := user.CreatedAt.Add(VerifyGracePeriod).UTC()
		me.VerifyDeadline = &deadline
		me.VerificationRequired = !s.Now().Before(deadline)
	}
	return me, nil
}
