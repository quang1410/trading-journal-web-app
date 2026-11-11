package httpapi

import (
	"net/http"
	"time"

	"journal/internal/service"
)

const refreshCookieName = "refresh_token"

// refreshCookiePath giới hạn cookie chỉ đi kèm request tới /api/auth/*,
// nên nó không bị gửi kèm mọi request dữ liệu.
const refreshCookiePath = "/api/auth"

type AuthHandler struct {
	svc *service.AuthService
	// secure bật cờ Secure của cookie. Tắt ở dev vì dev chạy http.
	secure bool
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if err := DecodeJSON(w, r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	s, err := h.svc.Register(r.Context(), service.RegisterInput{Email: req.Email, Password: req.Password, Locale: req.Locale})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	h.setRefreshCookie(w, s)
	OK(w, toSessionDTO(s))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if err := DecodeJSON(w, r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	s, err := h.svc.Login(r.Context(), req.Email, req.Password, limiterKey(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	h.setRefreshCookie(w, s)
	OK(w, toSessionDTO(s))
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	s, err := h.svc.Refresh(r.Context(), h.readRefreshCookie(r))
	if err != nil {
		// Phiên đã chết thì cookie cũng phải đi, nếu không trình duyệt sẽ
		// gửi lại mãi một token không bao giờ dùng được nữa.
		h.clearRefreshCookie(w)
		FailErr(w, r, err)
		return
	}
	h.setRefreshCookie(w, s)
	OK(w, toSessionDTO(s))
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Logout(r.Context(), h.readRefreshCookie(r)); err != nil {
		FailErr(w, r, err)
		return
	}
	h.clearRefreshCookie(w)
	OK(w, nil)
}

type verifyRequest struct {
	Token string `json:"token"`
}

type verifyRequestRequest struct {
	Locale string `json:"locale"`
}

// Verify tiêu thụ token trong link xác minh. Công khai.
func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := DecodeJSON(w, r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	if err := h.svc.VerifyEmail(r.Context(), req.Token); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, map[string]bool{"verified": true})
}

// RequestVerification gửi lại thư xác minh cho user đang đăng nhập.
func (h *AuthHandler) RequestVerification(w http.ResponseWriter, r *http.Request) {
	var req verifyRequestRequest
	if err := DecodeJSON(w, r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	if err := h.svc.RequestVerification(r.Context(), UserID(r.Context()), req.Locale); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, map[string]bool{"sent": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	m, err := h.svc.Me(r.Context(), UserID(r.Context()))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toMeDTO(m))
}

func (h *AuthHandler) readRefreshCookie(r *http.Request) string {
	c, err := r.Cookie(refreshCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, s service.Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    s.RefreshToken,
		Path:     refreshCookiePath,
		Expires:  s.RefreshExpiry,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}
