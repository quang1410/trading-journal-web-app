// Package service ghép repository với các package thuần, giữ luật nghiệp vụ
// và ranh giới transaction. Không import net/http — lỗi trả về là *apperr.Error,
// tầng httpapi dịch sang envelope.
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/repository"
)

// Thông điệp cố ý dùng chung cho mọi lý do đăng nhập hỏng: phân biệt ra là
// cho kẻ tấn công biết email nào đã đăng ký.
const msgSaiThongTinDangNhap = "email hoặc mật khẩu không đúng"

// Dùng chung cho mọi lý do refresh hỏng, vì lý do tương tự.
const msgPhienKhongHopLe = "phiên đăng nhập không hợp lệ, đăng nhập lại"

const minPasswordLen = 8

// Session là kết quả của một lần đăng nhập/đăng ký/refresh.
// RefreshToken là token THÔ, chỉ tồn tại trong response này một lần duy nhất —
// DB chỉ giữ hash của nó.
type Session struct {
	AccessToken   string
	RefreshToken  string
	RefreshExpiry time.Time
	User          repository.UserRow
}

type AuthService struct {
	users      *repository.UserRepo
	tokens     *repository.RefreshTokenRepo
	signer     *auth.Signer
	refreshTTL time.Duration

	// Now tiêm được để test hết hạn. Mặc định time.Now.
	Now func() time.Time
}

func NewAuthService(
	users *repository.UserRepo,
	tokens *repository.RefreshTokenRepo,
	signer *auth.Signer,
	refreshTTL time.Duration,
) *AuthService {
	return &AuthService{
		users:      users,
		tokens:     tokens,
		signer:     signer,
		refreshTTL: refreshTTL,
		Now:        time.Now,
	}
}

// Register chỉ thành công khi CHƯA có user nào. Sản phẩm dùng cho một người;
// mở đăng ký cho cả thế giới là lỗ hổng, không phải tính năng.
func (s *AuthService) Register(ctx context.Context, email, password string) (Session, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || !strings.Contains(email, "@") {
		return Session{}, apperr.Validation("email không hợp lệ")
	}
	if len(password) < minPasswordLen {
		return Session{}, apperr.Validation(fmt.Sprintf("mật khẩu phải dài ít nhất %d ký tự", minPasswordLen))
	}

	n, err := s.users.Count(ctx)
	if err != nil {
		return Session{}, fmt.Errorf("đếm user: %w", err)
	}
	if n > 0 {
		return Session{}, apperr.Forbidden("đã có tài khoản, đăng ký đã đóng")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return Session{}, fmt.Errorf("băm mật khẩu: %w", err)
	}

	user, err := s.users.Create(ctx, email, hash)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return Session{}, apperr.Conflict("email đã được dùng")
		}
		return Session{}, fmt.Errorf("tạo user: %w", err)
	}
	return s.issue(ctx, user)
}

func (s *AuthService) Login(ctx context.Context, email, password string) (Session, error) {
	email = strings.TrimSpace(strings.ToLower(email))

	user, err := s.users.ByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Vẫn băm một lần để thời gian phản hồi không tiết lộ email nào tồn tại.
			auth.VerifyDummy(password)
			return Session{}, apperr.Unauthorized(msgSaiThongTinDangNhap)
		}
		return Session{}, fmt.Errorf("tìm user: %w", err)
	}

	ok, err := auth.VerifyPassword(password, user.PasswordHash)
	if err != nil {
		return Session{}, fmt.Errorf("kiểm mật khẩu: %w", err)
	}
	if !ok {
		return Session{}, apperr.Unauthorized(msgSaiThongTinDangNhap)
	}
	return s.issue(ctx, user)
}

// Refresh xoay vòng token. Một token ĐÃ THU HỒI mà còn được gửi lên nghĩa là
// nó bị đánh cắp: giết mọi phiên của user đó, không chỉ token bị gửi lại.
func (s *AuthService) Refresh(ctx context.Context, rawToken string) (Session, error) {
	if rawToken == "" {
		return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
	}

	row, err := s.tokens.ByHash(ctx, auth.HashRefreshToken(rawToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
		}
		return Session{}, fmt.Errorf("tìm refresh token: %w", err)
	}

	now := s.Now()

	if row.RevokedAt != nil {
		if err := s.tokens.RevokeAllForUser(ctx, row.UserID, now); err != nil {
			return Session{}, fmt.Errorf("thu hồi toàn bộ phiên: %w", err)
		}
		return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
	}
	if !row.ExpiresAt.After(now) {
		return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
	}

	if err := s.tokens.Revoke(ctx, row.ID, now); err != nil {
		return Session{}, fmt.Errorf("thu hồi token cũ: %w", err)
	}

	user, err := s.users.ByID(ctx, row.UserID)
	if err != nil {
		return Session{}, fmt.Errorf("tìm user của token: %w", err)
	}
	return s.issue(ctx, user)
}

// Logout luôn thành công: gọi hai lần, hay gọi với token rác, đều không phải lỗi.
func (s *AuthService) Logout(ctx context.Context, rawToken string) error {
	if rawToken == "" {
		return nil
	}
	row, err := s.tokens.ByHash(ctx, auth.HashRefreshToken(rawToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("tìm refresh token: %w", err)
	}
	if row.RevokedAt != nil {
		return nil
	}
	return s.tokens.Revoke(ctx, row.ID, s.Now())
}

func (s *AuthService) issue(ctx context.Context, user repository.UserRow) (Session, error) {
	access, err := s.signer.SignAccess(user.ID)
	if err != nil {
		return Session{}, fmt.Errorf("ký access token: %w", err)
	}
	raw, err := auth.NewRefreshToken()
	if err != nil {
		return Session{}, fmt.Errorf("sinh refresh token: %w", err)
	}
	expiry := s.Now().Add(s.refreshTTL)
	if err := s.tokens.Create(ctx, user.ID, auth.HashRefreshToken(raw), expiry); err != nil {
		return Session{}, fmt.Errorf("lưu refresh token: %w", err)
	}
	return Session{AccessToken: access, RefreshToken: raw, RefreshExpiry: expiry, User: user}, nil
}
