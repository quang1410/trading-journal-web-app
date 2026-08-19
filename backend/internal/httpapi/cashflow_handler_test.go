package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func createAccount(t *testing.T, srvURL, token string) int64 {
	t.Helper()
	_, env := do(t, http.MethodPost, srvURL+"/api/accounts", token, bodyACC1)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &created))
	require.NotZero(t, created.ID)
	return created.ID
}

func TestCashFlowTaoRoiLietKe(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	path := srv.URL + "/api/accounts/" + itoa(accID) + "/cash-flows"

	resp, env := do(t, http.MethodPost, path, tokenA,
		`{"date":"2026-03-01","amount":"1500.50","type":"deposit","note":"nạp thêm"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, string(env.Data), `"amount":"1500.5"`,
		"tiền phải là chuỗi, thực tế: %s", env.Data)
	require.Contains(t, string(env.Data), `"date":"2026-03-01"`)

	listResp, listEnv := do(t, http.MethodGet, path, tokenA, "")
	require.Equal(t, http.StatusOK, listResp.StatusCode)
	var list []struct {
		ID   int64  `json:"id"`
		Note string `json:"note"`
	}
	require.NoError(t, json.Unmarshal(listEnv.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "nạp thêm", list[0].Note)
}

// Cùng lỗ hổng đã vá cho danh sách account: rỗng phải serialize thành [] chứ
// không phải null, vì null.map(...) là crash ở frontend. Đây là trạng thái của
// MỌI account vừa được tạo — chưa có giao dịch tiền nào.
func TestCashFlowDanhSachRongLaMangRong(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)

	resp, env := do(t, http.MethodGet,
		srv.URL+"/api/accounts/"+itoa(accID)+"/cash-flows", tokenA, "")

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `[]`, string(env.Data),
		"danh sách rỗng phải là [] chứ không phải null, thực tế: %s", env.Data)
}

func TestCashFlowInputHongTra400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	path := srv.URL + "/api/accounts/" + itoa(accID) + "/cash-flows"

	cases := map[string]string{
		"ngày sai định dạng": `{"date":"01/03/2026","amount":"100","type":"deposit","note":""}`,
		"số tiền bằng 0":     `{"date":"2026-03-01","amount":"0","type":"deposit","note":""}`,
		"số tiền âm":         `{"date":"2026-03-01","amount":"-5","type":"deposit","note":""}`,
		"loại lạ":            `{"date":"2026-03-01","amount":"100","type":"chuyen-khoan","note":""}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			resp, env := do(t, http.MethodPost, path, tokenA, body)
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)
			require.Equal(t, 1400, env.Code)
		})
	}
}

func TestCashFlowCuaAccountNguoiKhacTra403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	path := srv.URL + "/api/accounts/" + itoa(accID) + "/cash-flows"

	resp, env := do(t, http.MethodGet, path, tokenB, "")

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, env.Code)
}

// DELETE /api/cash-flows/{id} không có account id trên URL — đường kiểm quyền
// riêng của nó phải chặn được người khác.
func TestXoaCashFlowCuaNguoiKhacTra403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	_, env := do(t, http.MethodPost,
		srv.URL+"/api/accounts/"+itoa(accID)+"/cash-flows", tokenA,
		`{"date":"2026-03-01","amount":"100","type":"deposit","note":""}`)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &created))

	resp, delEnv := do(t, http.MethodDelete, srv.URL+"/api/cash-flows/"+itoa(created.ID), tokenB, "")
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, delEnv.Code)

	// Và bản ghi vẫn còn.
	_, listEnv := do(t, http.MethodGet, srv.URL+"/api/accounts/"+itoa(accID)+"/cash-flows", tokenA, "")
	var list []json.RawMessage
	require.NoError(t, json.Unmarshal(listEnv.Data, &list))
	require.Len(t, list, 1, "cash flow không được bị xoá bởi người khác")
}

func TestXoaCashFlowCuaMinhRoiXoaLaiTra404(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	_, env := do(t, http.MethodPost,
		srv.URL+"/api/accounts/"+itoa(accID)+"/cash-flows", tokenA,
		`{"date":"2026-03-01","amount":"100","type":"deposit","note":""}`)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &created))

	resp, _ := do(t, http.MethodDelete, srv.URL+"/api/cash-flows/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	again, againEnv := do(t, http.MethodDelete, srv.URL+"/api/cash-flows/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusNotFound, again.StatusCode, "xoá cứng: gọi lại phải 404")
	require.Equal(t, 1404, againEnv.Code)
}
