// Package auth lo phần mật mã của xác thực: băm mật khẩu và ký token.
// KHÔNG import GORM, net/http hay context — test của package này chạy
// không cần Docker, và đó là điều kiện để giữ nó như vậy.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Tham số argon2id. Được ghi thẳng vào chuỗi hash nên đổi về sau không phá
// hash cũ: VerifyPassword đọc tham số từ chính chuỗi đang kiểm.
const (
	argonIters   uint32 = 1
	argonMemory  uint32 = 64 * 1024 // KiB
	argonThreads uint8  = 4
	argonKeyLen  uint32 = 32
	argonSaltLen        = 16
)

// ErrHashInvalid nghĩa là chuỗi hash trong DB hỏng, KHÁC với "sai mật khẩu".
// Sai mật khẩu trả (false, nil).
var ErrHashInvalid = errors.New("chuỗi hash không đúng định dạng")

// HashPassword trả chuỗi dạng $argon2id$v=19$m=65536,t=1,p=4$<salt>$<hash>.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("sinh salt: %w", err)
	}
	sum := argon2.IDKey([]byte(password), salt, argonIters, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonIters, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(sum)), nil
}

// VerifyPassword so mật khẩu với chuỗi hash.
// Trả (true, nil) khi khớp, (false, nil) khi sai mật khẩu,
// (false, ErrHashInvalid) khi chuỗi hash hỏng.
func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return false, ErrHashInvalid
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, ErrHashInvalid
	}

	var memory, iters uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iters, &threads); err != nil {
		return false, ErrHashInvalid
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrHashInvalid
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false, ErrHashInvalid
	}

	got := argon2.IDKey([]byte(password), salt, iters, memory, threads, uint32(len(want)))
	// So sánh hằng thời gian: so byte-by-byte thường sẽ rò rỉ độ dài tiền tố khớp.
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// dummyHash là hash của một mật khẩu không ai dùng.
var dummyHash string

func init() {
	h, err := HashPassword("mat-khau-gia-chi-de-can-bang-thoi-gian")
	if err != nil {
		panic(fmt.Sprintf("không dựng được dummy hash: %v", err))
	}
	dummyHash = h
}

// VerifyDummy chạy một phép băm giả có cùng chi phí với một lần verify thật.
// Login gọi nó khi email không tồn tại, để thời gian phản hồi không tiết lộ
// email nào đã đăng ký. Kết quả cố ý bị bỏ đi.
func VerifyDummy(password string) {
	_, _ = VerifyPassword(password, dummyHash)
}
