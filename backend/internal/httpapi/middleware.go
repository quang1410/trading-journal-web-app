package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"journal/internal/auth"
	"journal/internal/domain"
	"journal/internal/service"
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

// RequireAccount nạp account trong URL và cưỡng chế quyền sở hữu.
// Phải mount SAU RequireAuth — nó đọc user id từ context.
func RequireAccount(svc *service.AccountService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
			if err != nil {
				Fail(w, http.StatusBadRequest, 1400, "id tài khoản không hợp lệ")
				return
			}
			acc, err := svc.ForUser(r.Context(), UserID(r.Context()), id)
			if err != nil {
				FailErr(w, r, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKeyAccount, acc)))
		})
	}
}

// Account lấy account đã kiểm quyền sở hữu. Chỉ gọi được sau RequireAccount.
func Account(ctx context.Context) domain.Account {
	a, _ := ctx.Value(ctxKeyAccount).(domain.Account)
	return a
}
