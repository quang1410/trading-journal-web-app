package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// newServer dựng router thật trên DB thật, kèm client giữ cookie như trình duyệt.
func newServer(t *testing.T) (*httptest.Server, *http.Client) {
	t.Helper()
	db := testdb.New(t)
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	authSvc := service.NewAuthService(
		repository.NewUserRepo(db),
		repository.NewRefreshTokenRepo(db),
		signer,
		720*time.Hour,
	)
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{Auth: authSvc, Signer: signer}))
	t.Cleanup(srv.Close)

	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	return srv, &http.Client{Jar: jar}
}

type envelopeBody struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func post(t *testing.T, c *http.Client, url, body string) (*http.Response, envelopeBody) {
	t.Helper()
	resp, err := c.Post(url, "application/json", strings.NewReader(body))
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	var env envelopeBody
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	return resp, env
}

func TestRegisterReturnsTokenAndSetsCookie(t *testing.T) {
	srv, client := newServer(t)

	resp, env := post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)

	var data struct {
		AccessToken string `json:"access_token"`
		User        struct {
			ID    int64  `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &data))
	require.NotEmpty(t, data.AccessToken)
	require.Equal(t, "a@example.com", data.User.Email)
	require.NotZero(t, data.User.ID)
	require.NotContains(t, string(env.Data), "password", "response không được lộ mật khẩu hay hash")

	var refresh *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "refresh_token" {
			refresh = c
		}
	}
	require.NotNil(t, refresh, "phải set cookie refresh_token")
	require.True(t, refresh.HttpOnly, "cookie refresh phải HttpOnly")
	require.Equal(t, "/api/auth", refresh.Path)
	require.Equal(t, http.SameSiteLaxMode, refresh.SameSite)
	require.NotEmpty(t, refresh.Value)
}

func TestRegisterSecondTimeReturns403(t *testing.T) {
	srv, client := newServer(t)
	_, _ = post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	resp, env := post(t, client, srv.URL+"/api/auth/register",
		`{"email":"b@example.com","password":"mat-khau-du-dai"}`)

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, env.Code)
	require.Equal(t, "đã có tài khoản, đăng ký đã đóng", env.Msg)
}

func TestLoginWrongPasswordReturns401(t *testing.T) {
	srv, client := newServer(t)
	_, _ = post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	resp, env := post(t, client, srv.URL+"/api/auth/login",
		`{"email":"a@example.com","password":"mat-khau-sai"}`)

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, 1401, env.Code)
	require.Equal(t, "email hoặc mật khẩu không đúng", env.Msg)
}

func TestBadJSONReturns400(t *testing.T) {
	srv, client := newServer(t)

	resp, env := post(t, client, srv.URL+"/api/auth/register", `{"email":`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

// Vòng đời đầy đủ, đúng như trình duyệt sẽ chạy: cookie tự đi theo client.
func TestRefreshLifecycleAndReuseDetection(t *testing.T) {
	srv, client := newServer(t)
	registerResp, _ := post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)
	var firstCookie string
	for _, c := range registerResp.Cookies() {
		if c.Name == "refresh_token" {
			firstCookie = c.Value
		}
	}
	require.NotEmpty(t, firstCookie)

	// Refresh bình thường: cookie mới khác cookie cũ.
	refreshResp, env := post(t, client, srv.URL+"/api/auth/refresh", "")
	require.Equal(t, http.StatusOK, refreshResp.StatusCode)
	require.Equal(t, 0, env.Code)
	var newCookie string
	for _, c := range refreshResp.Cookies() {
		if c.Name == "refresh_token" {
			newCookie = c.Value
		}
	}
	require.NotEmpty(t, newCookie)
	require.NotEqual(t, firstCookie, newCookie, "refresh phải xoay vòng cookie")

	// Kẻ tấn công gửi lại cookie CŨ bằng một client riêng.
	attacker := &http.Client{}
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/refresh", nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: firstCookie})
	replayResp, err := attacker.Do(req)
	require.NoError(t, err)
	defer func() { _ = replayResp.Body.Close() }()
	require.Equal(t, http.StatusUnauthorized, replayResp.StatusCode)

	// Và phiên hợp lệ của người dùng thật cũng phải chết theo.
	deadResp, _ := post(t, client, srv.URL+"/api/auth/refresh", "")
	require.Equal(t, http.StatusUnauthorized, deadResp.StatusCode,
		"phát hiện tái sử dụng phải giết cả phiên đang hợp lệ")
}

// Refresh hỏng thì cookie phải bị xoá. Không xoá thì trình duyệt giữ mãi một
// token đã chết và gửi lại nó ở mọi lần refresh sau — người dùng kẹt trong vòng
// lặp 401 cho tới khi tự xoá cookie bằng tay.
func TestRefreshFailureAlsoClearsCookie(t *testing.T) {
	srv, _ := newServer(t)
	client := &http.Client{}
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/refresh", nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: "token-bia-ra"})

	resp, err := client.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	var cleared bool
	for _, c := range resp.Cookies() {
		if c.Name == "refresh_token" && c.MaxAge < 0 {
			cleared = true
		}
	}
	require.True(t, cleared, "refresh thất bại phải xoá cookie (MaxAge âm)")
}

// DecodeJSON bật DisallowUnknownFields có chủ đích: một field gõ sai tên phải
// thành lỗi 400 ồn ào, thay vì bị bỏ qua im lặng. Quan trọng nhất ở các task
// sau — nuốt mất "risk_per_trade" là mọi R-multiple sai mà không ai biết.
func TestUnknownFieldReturns400(t *testing.T) {
	srv, client := newServer(t)

	resp, env := post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai","quyen":"admin"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestLogoutClearsCookieAndBlocksRefresh(t *testing.T) {
	srv, client := newServer(t)
	_, _ = post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	logoutResp, env := post(t, client, srv.URL+"/api/auth/logout", "")

	require.Equal(t, http.StatusOK, logoutResp.StatusCode)
	require.Equal(t, 0, env.Code)
	var cleared bool
	for _, c := range logoutResp.Cookies() {
		if c.Name == "refresh_token" && c.MaxAge < 0 {
			cleared = true
		}
	}
	require.True(t, cleared, "logout phải xoá cookie (MaxAge âm)")

	// Gọi lại logout không phải lỗi.
	again, _ := post(t, client, srv.URL+"/api/auth/logout", "")
	require.Equal(t, http.StatusOK, again.StatusCode)
}

func TestRefreshWithoutCookieReturns401(t *testing.T) {
	srv, _ := newServer(t)
	client := &http.Client{}

	resp, env := post(t, client, srv.URL+"/api/auth/refresh", "")

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, 1401, env.Code)
}
