package httpapi_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func notePath(accID int64, period, key string) string {
	return fmt.Sprintf("/api/accounts/%d/period-notes/%s/%s", accID, period, key)
}

type periodNoteRow struct {
	Period    string `json:"period"`
	PeriodKey string `json:"period_key"`
	BodyHTML  string `json:"body_html"`
}

// Khoá sai dạng bị chặn ở 400 TRƯỚC khi chạm DB: period_key thành bãi rác
// chuỗi tự do nếu không có cổng này.
func TestPeriodNotePutRejectsBadKey(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN1")

	resp, _ := do(t, http.MethodPut, srv.URL+notePath(acc, "day", "21-09-2026"), tokenA,
		`{"body_html":"<p>x</p>"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestPeriodNotePutRejectsBadPeriod(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN2")

	resp, _ := do(t, http.MethodPut, srv.URL+notePath(acc, "month", "2026-09"), tokenA,
		`{"body_html":"<p>x</p>"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// Lưu rồi đọc lại: vòng đời đầy đủ qua HTTP.
func TestPeriodNotePutThenList(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN3")

	resp, env := do(t, http.MethodPut, srv.URL+notePath(acc, "day", "2026-09-21"), tokenA,
		`{"body_html":"<p>vào lệnh sớm</p>"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode, string(env.Data))

	resp, env = do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/period-notes?period=day", srv.URL, acc), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var list []periodNoteRow
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "2026-09-21", list[0].PeriodKey)
	require.Equal(t, "<p>vào lệnh sớm</p>", list[0].BodyHTML)
}

// Rỗng phải serialize thành [] chứ không phải null: null.map(...) là crash ở
// frontend.
func TestPeriodNoteEmptyListIsEmptyArray(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN4")

	resp, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/period-notes?period=week", srv.URL, acc), tokenA, "")

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `[]`, string(env.Data))
}

// Body rỗng xoá ghi chú, và trả 200 chứ không 404: kết quả mong muốn đã đạt.
func TestPeriodNotePutEmptyBodyDeletes(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN5")

	resp, _ := do(t, http.MethodPut, srv.URL+notePath(acc, "day", "2026-09-21"), tokenA,
		`{"body_html":"<p>x</p>"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	resp, _ = do(t, http.MethodPut, srv.URL+notePath(acc, "day", "2026-09-21"), tokenA,
		`{"body_html":""}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/period-notes?period=day", srv.URL, acc), tokenA, "")
	require.JSONEq(t, `[]`, string(env.Data))
}

// Xoá ghi chú không tồn tại là 404: người dùng chủ động bấm xoá một thứ họ
// tin là đang có.
func TestPeriodNoteDeleteMissingReturns404(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN6")

	resp, _ := do(t, http.MethodDelete, srv.URL+notePath(acc, "day", "2026-09-21"), tokenA, "")

	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// Account của người khác bị chặn ở 403 — mã mà RequireAccount trả cho MỌI
// route dưới /accounts/{id}. Ghi chú kỳ đi qua đúng middleware đó, nên nó
// không được tự chế một mã riêng.
func TestPeriodNoteOtherUserAccountIsRejected(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN7")

	resp, _ := do(t, http.MethodPut, srv.URL+notePath(acc, "day", "2026-09-21"), tokenB,
		`{"body_html":"<p>x</p>"}`)

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestPeriodNoteRequiresAuth(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PN8")

	resp, _ := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/period-notes?period=day", srv.URL, acc), "", "")

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestPeriodsRejectsUnknownPeriod(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PS1")

	resp, _ := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/periods?period=month", srv.URL, acc), tokenA, "")

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// Không có tham số period thì mặc định là "day" — tab mặc định của UI.
func TestPeriodsDefaultsToDay(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PS2")
	makeTrade(t, srv.URL, tokenA, acc, tradeBody)

	resp, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/periods", srv.URL, acc), tokenA, "")

	require.Equal(t, http.StatusOK, resp.StatusCode, string(env.Data))
	var list []struct {
		Key string `json:"key"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "2026-06-09", list[0].Key, "khoá ngày theo timezone account")
}

// KPI của thẻ KHÔNG mang current_balance/net_cash_flow: số dư là một mốc tại
// một thời điểm, không phải đại lượng của một khoảng.
func TestPeriodsOmitsBalanceFields(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PS3")
	makeTrade(t, srv.URL, tokenA, acc, tradeBody)

	_, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/periods", srv.URL, acc), tokenA, "")

	var list []struct {
		KPI map[string]any `json:"kpi"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.NotContains(t, list[0].KPI, "current_balance")
	require.NotContains(t, list[0].KPI, "net_cash_flow")
	// Nhưng các chỉ số CÓ nghĩa ở cấp kỳ vẫn còn đủ.
	require.Contains(t, list[0].KPI, "net_profit")
	require.Contains(t, list[0].KPI, "profit_factor")
}

// Thẻ tuần gom theo tuần ISO và mang mốc đầu/cuối tuần.
func TestPeriodsWeekReturnsBounds(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "PS4")
	makeTrade(t, srv.URL, tokenA, acc, tradeBody) // 2026-06-09, thứ Ba

	_, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/periods?period=week", srv.URL, acc), tokenA, "")

	var list []struct {
		Key   string `json:"key"`
		Start string `json:"start"`
		End   string `json:"end"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "2026-W24", list[0].Key)
	require.Equal(t, "2026-06-08", list[0].Start, "thứ Hai")
	require.Equal(t, "2026-06-14", list[0].End, "Chủ nhật")
}
