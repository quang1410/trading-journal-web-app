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
const msgInvalidCredentials = "email hoặc mật khẩu không đúng"

// Dùng chung cho mọi lý do refresh hỏng, vì lý do tương tự.
const msgInvalidSession = "phiên đăng nhập không hợp lệ, đăng nhập lại"

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
	users      UserStore
	tokens     RefreshTokenStore
	signer     *auth.Signer
	refreshTTL time.Duration

	// Now tiêm được để test hết hạn. Mặc định time.Now.
	Now func() time.Time
}

func NewAuthService(
	users UserStore,
	tokens RefreshTokenStore,
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
		return Session{}, fmt.Errorf("count users: %w", err)
	}
	if n > 0 {
		return Session{}, apperr.Forbidden("đã có tài khoản, đăng ký đã đóng")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return Session{}, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.users.Create(ctx, email, hash)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return Session{}, apperr.Conflict("email đã được dùng")
		}
		return Session{}, fmt.Errorf("create user: %w", err)
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
			return Session{}, apperr.Unauthorized(msgInvalidCredentials)
		}
		return Session{}, fmt.Errorf("find user: %w", err)
	}

	ok, err := auth.VerifyPassword(password, user.PasswordHash)
	if err != nil {
		return Session{}, fmt.Errorf("verify password: %w", err)
	}
	if !ok {
		return Session{}, apperr.Unauthorized(msgInvalidCredentials)
	}
	return s.issue(ctx, user)
}

// Refresh xoay vòng token. Một token ĐÃ THU HỒI mà còn được gửi lên nghĩa là
// nó bị đánh cắp: giết mọi phiên của user đó, không chỉ token bị gửi lại.
func (s *AuthService) Refresh(ctx context.Context, rawToken string) (Session, error) {
	if rawToken == "" {
		return Session{}, apperr.Unauthorized(msgInvalidSession)
	}

	row, err := s.tokens.ByHash(ctx, auth.HashRefreshToken(rawToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return Session{}, apperr.Unauthorized(msgInvalidSession)
		}
		return Session{}, fmt.Errorf("find refresh token: %w", err)
	}

	now := s.Now()

	if row.RevokedAt != nil {
		return Session{}, s.rejectReuse(ctx, row.UserID, now)
	}
	if !row.ExpiresAt.After(now) {
		return Session{}, apperr.Unauthorized(msgInvalidSession)
	}

	user, err := s.users.ByID(ctx, row.UserID)
	if err != nil {
		return Session{}, fmt.Errorf("find token user: %w", err)
	}
	sess, hash, err := s.mint(user)
	if err != nil {
		return Session{}, err
	}

	// Bước kiểm RevokedAt ở trên chỉ bắt được tái sử dụng tuần tự. Hai request
	// song song cùng qua được bước đó; Rotate (một transaction) mới phân xử, và
	// bên thua bị coi như tái sử dụng.
	rotated, err := s.tokens.Rotate(ctx, row.ID, row.UserID, hash, sess.RefreshExpiry, now)
	if err != nil {
		return Session{}, fmt.Errorf("rotate refresh token: %w", err)
	}
	if !rotated {
		return Session{}, s.rejectReuse(ctx, row.UserID, now)
	}
	return sess, nil
}

// rejectReuse xử lý một token bị dùng lại: giết mọi phiên còn sống của user rồi
// trả 401. Luôn trả lỗi khác nil.
func (s *AuthService) rejectReuse(ctx context.Context, userID int64, now time.Time) error {
	if err := s.tokens.RevokeAllForUser(ctx, userID, now); err != nil {
		return fmt.Errorf("revoke all sessions: %w", err)
	}
	return apperr.Unauthorized(msgInvalidSession)
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
		return fmt.Errorf("find refresh token: %w", err)
	}
	if row.RevokedAt != nil {
		return nil
	}
	return s.tokens.Revoke(ctx, row.ID, s.Now())
}

func (s *AuthService) issue(ctx context.Context, user repository.UserRow) (Session, error) {
	sess, hash, err := s.mint(user)
	if err != nil {
		return Session{}, err
	}
	if err := s.tokens.Create(ctx, user.ID, hash, sess.RefreshExpiry); err != nil {
		return Session{}, fmt.Errorf("save refresh token: %w", err)
	}
	return sess, nil
}

// mint ký access token và sinh refresh token mới, CHƯA lưu. Trả kèm hash của
// refresh token để bên gọi tự chọn cách lưu (Create, hay Rotate khi xoay vòng).
func (s *AuthService) mint(user repository.UserRow) (Session, string, error) {
	access, err := s.signer.SignAccess(user.ID)
	if err != nil {
		return Session{}, "", fmt.Errorf("sign access token: %w", err)
	}
	raw, err := auth.NewRefreshToken()
	if err != nil {
		return Session{}, "", fmt.Errorf("generate refresh token: %w", err)
	}
	expiry := s.Now().Add(s.refreshTTL)
	sess := Session{AccessToken: access, RefreshToken: raw, RefreshExpiry: expiry, User: user}
	return sess, auth.HashRefreshToken(raw), nil
}
