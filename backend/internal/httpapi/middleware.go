package httpapi

import (
	"context"
	"net/http"
	"strings"

	"journal/internal/auth"
)

type ctxKey int

const (
	ctxKeyUserID ctxKey = iota
	ctxKeyAccount
)

// RequireAuth chặn request không mang access token hợp lệ và đặt user id vào
// context. Mọi endpoint dữ liệu phải đi qua đây.
func RequireAuth(signer *auth.Signer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearerToken(r)
			if raw == "" {
				Fail(w, http.StatusUnauthorized, 1401, "chưa đăng nhập")
				return
			}
			userID, err := signer.ParseAccess(raw)
			if err != nil {
				Fail(w, http.StatusUnauthorized, 1401, "phiên đăng nhập đã hết hạn")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKeyUserID, userID)))
		})
	}
}

// UserID lấy user id đã xác thực. Trả 0 nếu chưa qua RequireAuth.
func UserID(ctx context.Context) int64 {
	id, _ := ctx.Value(ctxKeyUserID).(int64)
	return id
}

// bearerToken đọc "Authorization: Bearer <token>". Scheme không phân biệt
// hoa thường theo RFC 6750.
func bearerToken(r *http.Request) string {
	const prefix = "bearer "
	h := r.Header.Get("Authorization")
	if len(h) <= len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}
