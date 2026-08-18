package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken gộp mọi lý do access token không dùng được: sai chữ ký,
// hết hạn, sai thuật toán, rác. Cố ý không phân biệt — client không cần biết
// lý do, và phân biệt ra là cho kẻ tấn công thêm tín hiệu.
var ErrInvalidToken = errors.New("access token không hợp lệ")

// Signer ký và kiểm access token JWT HS256.
type Signer struct {
	secret    []byte
	accessTTL time.Duration
	now       func() time.Time // tiêm được để test hết hạn
}

func NewSigner(secret string, accessTTL time.Duration) *Signer {
	return &Signer{secret: []byte(secret), accessTTL: accessTTL, now: time.Now}
}

// SignAccess phát access token cho user.
func (s *Signer) SignAccess(userID int64) (string, error) {
	now := s.now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
	})
	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", fmt.Errorf("ký access token: %w", err)
	}
	return signed, nil
}

// ParseAccess trả user id trong token, hoặc ErrInvalidToken.
func (s *Signer) ParseAccess(raw string) (int64, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(raw, &claims,
		func(*jwt.Token) (any, error) { return s.secret, nil },
		// WithValidMethods chặn alg=none và mọi thuật toán ngoài HS256.
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithTimeFunc(s.now),
	)
	if err != nil {
		return 0, ErrInvalidToken
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrInvalidToken
	}
	return id, nil
}

// NewRefreshToken sinh token thô 32 byte ngẫu nhiên, mã base64url không đệm.
// Cố ý KHÔNG phải JWT: mỗi lần dùng đều phải tra DB nên token tự mô tả không
// mang lại gì, mà lại kéo khoá ký vào credential sống lâu nhất hệ thống.
func NewRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("sinh refresh token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashRefreshToken băm token thô để lưu DB. Token thô KHÔNG BAO GIỜ được lưu:
// đọc trộm được bảng refresh_tokens cũng không mạo danh được ai.
func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
