package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"journal/internal/auth"
	"journal/internal/service"
)

// Deps là mọi thứ router cần để dựng handler. Các task sau thêm trường vào
// đây; trường nil nghĩa là nhánh route đó không được gắn, nhờ vậy test dựng
// được router tối thiểu.
type Deps struct {
	Auth        *service.AuthService
	Account     *service.AccountService
	CashFlow    *service.CashFlowService
	Trade       *service.TradeService
	Signer      *auth.Signer
	Secure      bool     // bật cờ Secure của cookie; bật ở prod
	CORSOrigins []string // origin được phép gọi API từ trình duyệt
}

// NewRouter dựng toàn bộ route của API. Mọi nhánh lỗi cũng trả envelope,
// kể cả 404 và 405 — frontend chỉ cần một hàm unwrap duy nhất.
func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer)
	r.Use(CORS(d.CORSOrigins))

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusNotFound, 1404, "không tìm thấy endpoint")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusMethodNotAllowed, 1405, "method không được hỗ trợ")
	})

	r.Get("/healthz", Healthz)

	r.Route("/api", func(api chi.Router) {
		// Ruling 1 của pre-flight: mount NGOÀI mọi guard dịch vụ. Đây là dữ
		// liệu tham chiếu tĩnh, không cần auth cũng không cần DB, và test của
		// task này dựng router từ Deps rỗng.
		api.Get("/meta/enums", MetaEnums)

		if d.Auth != nil {
			h := &AuthHandler{svc: d.Auth, secure: d.Secure}
			api.Route("/auth", func(a chi.Router) {
				a.Post("/register", h.Register)
				a.Post("/login", h.Login)
				a.Post("/refresh", h.Refresh)
				a.Post("/logout", h.Logout)
			})
		}
		if d.Account != nil && d.CashFlow != nil && d.Signer != nil {
			ah := &AccountHandler{svc: d.Account}
			cf := &CashFlowHandler{svc: d.CashFlow}
			th := &TradeHandler{svc: d.Trade}
			api.Group(func(priv chi.Router) {
				priv.Use(RequireAuth(d.Signer))
				priv.Get("/accounts", ah.List)
				priv.Post("/accounts", ah.Create)
				priv.Route("/accounts/{id}", func(one chi.Router) {
					one.Use(RequireAccount(d.Account))
					one.Patch("/", ah.Update)
					one.Get("/cash-flows", cf.List)
					one.Post("/cash-flows", cf.Create)

					// Nhánh trade gắn vào CÙNG một Route "/accounts/{id}".
					// chi từ chối đăng ký hai lần cùng một pattern, nên gộp
					// ở đây chứ không mở một khối priv.Route thứ hai.
					if d.Trade != nil {
						one.Route("/trades", func(tr chi.Router) {
							tr.Get("/", th.List)
							tr.Post("/", th.Create)
							tr.Get("/trash", th.Trash)
						})
						one.Get("/stats", th.Stats)
						one.Get("/charts", th.Charts)
					}
				})
				priv.Delete("/cash-flows/{id}", cf.Delete)

				if d.Trade != nil {
					priv.Route("/trades/{id}", func(one chi.Router) {
						one.Use(RequireTrade(d.Trade))
						one.Get("/", th.Get)
						one.Patch("/", th.Update)
						one.Delete("/", th.Delete)
						one.Post("/restore", th.Restore)
					})
				}
			})
		}
	})

	return r
}
