package auth_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
)

func TestHashThenVerifyCorrectPassword(t *testing.T) {
	encoded, err := auth.HashPassword("mat-khau-rat-dai-va-an-toan")
	require.NoError(t, err)

	ok, err := auth.VerifyPassword("mat-khau-rat-dai-va-an-toan", encoded)

	require.NoError(t, err)
	require.True(t, ok)
}

func TestVerifyReturnsFalseForWrongPassword(t *testing.T) {
	encoded, err := auth.HashPassword("mat-khau-dung")
	require.NoError(t, err)

	ok, err := auth.VerifyPassword("mat-khau-sai", encoded)

	require.NoError(t, err, "sai mật khẩu không phải lỗi hệ thống, chỉ là false")
	require.False(t, ok)
}

// Salt ngẫu nhiên: hai lần băm cùng một mật khẩu phải ra hai chuỗi khác nhau,
// nếu không thì bảng rainbow dùng lại được.
func TestHashingSamePasswordTwiceGivesDifferentStrings(t *testing.T) {
	a, err := auth.HashPassword("cùng một mật khẩu")
	require.NoError(t, err)
	b, err := auth.HashPassword("cùng một mật khẩu")
	require.NoError(t, err)

	require.NotEqual(t, a, b)

	// Nhưng cả hai vẫn verify được.
	okA, err := auth.VerifyPassword("cùng một mật khẩu", a)
	require.NoError(t, err)
	require.True(t, okA)
	okB, err := auth.VerifyPassword("cùng một mật khẩu", b)
	require.NoError(t, err)
	require.True(t, okB)
}

// Tham số nằm trong chuỗi hash để đổi được về sau mà không phá hash cũ.
func TestHashStringContainsParameters(t *testing.T) {
	encoded, err := auth.HashPassword("bất kỳ")
	require.NoError(t, err)

	require.True(t, strings.HasPrefix(encoded, "$argon2id$v=19$m=65536,t=1,p=4$"),
		"định dạng thực tế: %s", encoded)
	require.Len(t, strings.Split(encoded, "$"), 6)
}

func TestVerifyRejectsMalformedHashString(t *testing.T) {
	cases := map[string]string{
		"rỗng":                   "",
		"không đủ đoạn":          "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA",
		"sai thuật toán":         "$bcrypt$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		"sai version":            "$argon2id$v=13$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		"tham số không đọc được": "$argon2id$v=19$m=abc,t=1,p=4$c2FsdA$aGFzaA",
		"salt không phải base64": "$argon2id$v=19$m=65536,t=1,p=4$!!!$aGFzaA",
		"hash không phải base64": "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$!!!",
		"hash rỗng":              "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$",
	}
	for name, encoded := range cases {
		t.Run(name, func(t *testing.T) {
			ok, err := auth.VerifyPassword("bất kỳ", encoded)
			require.ErrorIs(t, err, auth.ErrHashInvalid)
			require.False(t, ok)
		})
	}
}

// VerifyDummy chạy khi email không tồn tại, để thời gian phản hồi của
// /login không tiết lộ email nào đã đăng ký. Nó không được panic.
func TestVerifyDummyDoesNotPanic(t *testing.T) {
	require.NotPanics(t, func() { auth.VerifyDummy("bất kỳ") })
}
