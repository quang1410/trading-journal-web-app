package auth

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSignRoiParseTraVeUserID(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)

	token, err := s.SignAccess(42)
	require.NoError(t, err)

	got, err := s.ParseAccess(token)

	require.NoError(t, err)
	require.Equal(t, int64(42), got)
}

func TestParseTuChoiTokenHetHan(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	base := time.Date(2026, 8, 18, 10, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return base }

	token, err := s.SignAccess(42)
	require.NoError(t, err)

	// Ngay trước khi hết hạn: còn dùng được.
	s.now = func() time.Time { return base.Add(14 * time.Minute) }
	_, err = s.ParseAccess(token)
	require.NoError(t, err)

	// Sau khi hết hạn: hỏng.
	s.now = func() time.Time { return base.Add(16 * time.Minute) }
	_, err = s.ParseAccess(token)
	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestParseTuChoiTokenKyBangKhoaKhac(t *testing.T) {
	signer := NewSigner("khoa-that", 15*time.Minute)
	keAnCap := NewSigner("khoa-gia", 15*time.Minute)

	token, err := keAnCap.SignAccess(42)
	require.NoError(t, err)

	_, err = signer.ParseAccess(token)

	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestParseTuChoiTokenBiSua(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	token, err := s.SignAccess(42)
	require.NoError(t, err)

	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)
	// Đổi payload thành sub = 999 mà giữ nguyên chữ ký cũ.
	parts[1] = base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"999"}`))

	_, err = s.ParseAccess(strings.Join(parts, "."))

	require.ErrorIs(t, err, ErrInvalidToken)
}

// alg=none là lỗ hổng JWT kinh điển: token không chữ ký được chấp nhận nếu
// thư viện tin vào header. WithValidMethods phải chặn nó.
func TestParseTuChoiAlgNone(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"42"}`))

	_, err := s.ParseAccess(header + "." + payload + ".")

	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestParseTuChoiRacHoanToan(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	for _, bad := range []string{"", "abc", "a.b.c", "....."} {
		_, err := s.ParseAccess(bad)
		require.ErrorIs(t, err, ErrInvalidToken, "input: %q", bad)
	}
}

func TestNewRefreshTokenSinhGiaTriKhacNhau(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		tok, err := NewRefreshToken()
		require.NoError(t, err)
		require.Len(t, tok, 43, "32 byte mã base64url không đệm dài 43 ký tự")
		require.False(t, seen[tok], "sinh trùng token ở lần %d", i)
		seen[tok] = true
	}
}

func TestHashRefreshTokenOnDinhVaKhacNhau(t *testing.T) {
	require.Equal(t, HashRefreshToken("abc"), HashRefreshToken("abc"))
	require.NotEqual(t, HashRefreshToken("abc"), HashRefreshToken("abd"))
	require.Len(t, HashRefreshToken("abc"), 64, "sha256 hex dài 64 ký tự")
	require.NotContains(t, HashRefreshToken("abc"), "abc", "hash không được chứa token thô")
}
