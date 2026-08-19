package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/httpapi"
)

// RequireAuth được test trực tiếp trên một handler giả, để không phải mượn
// một endpoint nghiệp vụ nào làm bia đỡ.
func TestRequireAuth(t *testing.T) {
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)

	var seenUserID int64
	protected := httpapi.RequireAuth(signer)(http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			seenUserID = httpapi.UserID(r.Context())
			httpapi.OK(w, map[string]string{"ok": "yes"})
		}))

	cases := []struct {
		name       string
		header     string
		wantStatus int
	}{
		{"không có header", "", http.StatusUnauthorized},
		{"sai scheme", "Basic " + token, http.StatusUnauthorized},
		{"token rác", "Bearer abc.def.ghi", http.StatusUnauthorized},
		{"Bearer rỗng", "Bearer ", http.StatusUnauthorized},
		{"token hợp lệ", "Bearer " + token, http.StatusOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			seenUserID = 0
			req := httptest.NewRequest(http.MethodGet, "/bat-ky", nil)
			if c.header != "" {
				req.Header.Set("Authorization", c.header)
			}
			rec := httptest.NewRecorder()

			protected.ServeHTTP(rec, req)

			require.Equal(t, c.wantStatus, rec.Code)
			require.Contains(t, rec.Body.String(), `"code"`, "lỗi cũng phải đi qua envelope")
			if c.wantStatus == http.StatusOK {
				require.Equal(t, int64(7), seenUserID, "user id phải vào được context")
			} else {
				require.Zero(t, seenUserID)
			}
		})
	}
}

// Case "sai scheme" ở trên KHÔNG phân biệt được: "Basic " dài 6 ký tự, nên bỏ
// hẳn phép so scheme đi thì h[7:] vẫn là token đã mất ký tự đầu, vẫn hỏng, vẫn
// 401 — test xanh vì lý do sai. "Cookie " dài đúng 7 ký tự bằng "Bearer ", nên
// nếu không so scheme thì phần còn lại là token NGUYÊN VẸN và request lọt qua.
// Đây mới là case chứng minh phép so scheme là thứ duy nhất chặn.
func TestRequireAuthTuChoiSchemeDaiBangBearer(t *testing.T) {
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)
	protected := httpapi.RequireAuth(signer)(http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) { httpapi.OK(w, nil) }))
	req := httptest.NewRequest(http.MethodGet, "/bat-ky", nil)
	req.Header.Set("Authorization", "Cookie "+token) // "Cookie " và "Bearer " cùng 7 ký tự
	rec := httptest.NewRecorder()

	protected.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code,
		"scheme sai phải bị từ chối kể cả khi token phía sau hoàn toàn hợp lệ")
}

// Scheme "bearer" viết thường vẫn phải nhận — RFC 6750 nói scheme không phân biệt hoa thường.
func TestRequireAuthChapNhanSchemeVietThuong(t *testing.T) {
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)
	protected := httpapi.RequireAuth(signer)(http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) { httpapi.OK(w, nil) }))
	req := httptest.NewRequest(http.MethodGet, "/bat-ky", nil)
	req.Header.Set("Authorization", "bearer "+token)
	rec := httptest.NewRecorder()

	protected.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
}
