package httpapi_test

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/httpapi"
)

// oversizeJSON là JSON HỢP LỆ nhưng vượt trần đúng một byte: chuỗi rác đặt
// trong một field, phần đệm là khoảng trắng đầu body (JSON cho phép). Body hỏng
// cú pháp thì chẳng chứng minh được gì — nó vốn đã bị từ chối.
func oversizeJSON(valid string) string {
	return strings.Repeat(" ", httpapi.MaxJSONBodyBytes+1-len(valid)) + valid
}

// Body quá cỡ phải nói ĐÚNG lý do (413 "quá lớn"), không phải "không đọc
// được" — và route công khai (login, waitlist) cũng chịu cùng trần.
func TestOversizeJSONBodyIs413OnEveryRoute(t *testing.T) {
	// testdb.New dùng chung MỘT DB và truncate mỗi lần gọi: dựng server
	// waitlist trước, nếu không nó xoá sạch account vừa tạo cho server kia.
	wl, _ := waitlistServer(t)
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "BL1")
	tradeID := makeTrade(t, srv.URL, tokenA, acc, tradeBody)

	cases := []struct {
		name, method, url, token, body string
	}{
		{"login", http.MethodPost, srv.URL + "/api/auth/login", "",
			`{"email":"a@example.com","password":"mat-khau-du-dai"}`},
		{"waitlist", http.MethodPost, wl.URL + waitlistPath, "",
			`{"email":"toi@gmail.com","locale":"vi","source":"x","website":""}`},
		{"create trade", http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
			tradeBody},
		{"patch trade", http.MethodPatch, fmt.Sprintf("%s/api/trades/%d", srv.URL, tradeID), tokenA,
			`{"notes":"x"}`},
		{"period note", http.MethodPut, srv.URL + notePath(acc, "day", "2026-09-21"), tokenA,
			`{"body_html":"<p>x</p>"}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			resp, env := do(t, c.method, c.url, c.token, oversizeJSON(c.body))

			require.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
			require.Equal(t, 1413, env.Code)
			require.Equal(t, "dữ liệu gửi lên quá lớn", env.Msg)
		})
	}
}

// Đúng bằng trần thì KHÔNG bị chặn vì cỡ — trần là "lớn hơn", không phải "từ".
func TestJSONBodyExactlyAtLimitIsAccepted(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "BL2")

	body := strings.Repeat(" ", httpapi.MaxJSONBodyBytes-len(tradeBody)) + tradeBody
	require.Len(t, body, httpapi.MaxJSONBodyBytes)

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, body)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
}

// Ghi chú dài tối đa phải VỪA body ở mọi cách mã hoá JSON hợp lệ. Cách tốn
// nhất: ký tự ngoài BMP escape thành cặp surrogate "\ud83d\ude00" — 12 byte
// mỗi ký tự, đúng thứ json.dumps của Python làm mặc định. Ở trần 1 MiB ca này
// từng ra 413 cho một ghi chú hợp lệ.
func TestMaxLengthNoteFitsUnderBodyLimitInWorstEscaping(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "BL4")

	notes := strings.Repeat(`\ud83d\ude00`, domain.MaxNotesLen)
	body := tradeBody[:len(tradeBody)-1] + `,"notes":"` + notes + `"}`
	require.Greater(t, len(body), 1<<20, "the worst case must exceed the old 1 MiB cap")

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, body)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
}

// Body chunked không khai Content-Length vẫn bị chặn — trần đếm byte đọc được,
// không tin con số client tự khai.
func TestChunkedOversizeBodyIs413(t *testing.T) {
	srv, _, _ := twoUserServer(t)

	// io.MultiReader giấu độ dài; ContentLength = -1 (không rõ) thì net/http
	// gửi Transfer-Encoding: chunked.
	body := io.MultiReader(strings.NewReader(oversizeJSON(`{"email":"a@example.com","password":"x"}`)))
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/login", body)
	require.NoError(t, err)
	req.ContentLength = -1
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })

	require.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
}

// Ghi chú quá trần nằm gọn trong body → 400 về độ dài, không phải 413 về body:
// người dùng cần biết rút ngắn ghi chú, không phải "dữ liệu quá lớn" chung chung.
func TestNotesOverLimitIs400NotPayloadTooLarge(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "BL3")
	id := makeTrade(t, srv.URL, tokenA, acc, tradeBody)

	over := strings.Repeat("ắ", domain.MaxNotesLen+1)
	resp, env := do(t, http.MethodPatch, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), tokenA,
		fmt.Sprintf(`{"notes":%q}`, over))

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, "ghi chú dài quá 131072 ký tự", env.Msg)
}
