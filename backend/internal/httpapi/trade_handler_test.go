package httpapi_test

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// taoAccountQuaAPI tạo một account và trả id của nó.
func taoAccountQuaAPI(t *testing.T, srv string, token, code string) int64 {
	t.Helper()
	resp, env := do(t, http.MethodPost, srv+"/api/accounts", token,
		fmt.Sprintf(`{"code":%q,"name":"","currency":"USD","timezone":"Asia/Ho_Chi_Minh","initial_balance":"10000","risk_per_trade":"0.01"}`, code))
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &acc))
	return acc.ID
}

const bodyLenh = `{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100","fee":"2"}`

func taoLenh(t *testing.T, srv string, token string, accID int64, body string) int64 {
	t.Helper()
	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv, accID), token, body)
	require.Equal(t, http.StatusOK, resp.StatusCode, string(env.Data))
	var tr struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &tr))
	return tr.ID
}

func TestTaoLenhTraVeTruongSuyDien(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100","fee":"2","entry_quality":"Đúng kế hoạch","in_trade_quality":"Tuân thủ kế hoạch","exit_quality":"Chạm Chốt lời","psychology":"Không lỗi"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)
	var got map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &got))
	require.EqualValues(t, 1, got["stt"])
	require.Equal(t, "98", got["net"], "net = profit − fee = 100 − 2")
	require.EqualValues(t, 100, got["score_total"])
	require.Equal(t, "Đúng kế hoạch", got["trade_class"])
	require.Equal(t, "2026-06-09", got["day"], "12:00 giờ VN ngày 09 vẫn là ngày 09")
	require.Equal(t, "2026-06-09T05:00:00Z", got["entered_at"], "trả về UTC")
}

// Quy tắc 7 của CLAUDE.md: stt do frontend gửi lên bị BỎ QUA, không phải bị
// từ chối. Trường stt tồn tại trong DTO chỉ để DisallowUnknownFields không
// biến nó thành lỗi 400.
func TestTaoLenhBoQuaSTTDoFrontendGui(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"stt":999,"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode, "gửi stt không được thành lỗi")
	var got map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &got))
	require.EqualValues(t, 1, got["stt"], "backend cấp stt thật, bỏ qua 999")
}

// entered_at phải mang offset. "2026-06-09T12:00:00" trần trụi là mơ hồ:
// backend không có cách nào biết đó là giờ nào, và đoán bừa sẽ làm lệnh rơi
// sai ngày mà không ai hay.
func TestTaoLenhEnteredAtThieuOffsetLa400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"entered_at":"2026-06-09T12:00:00","symbol":"XAUUSD","direction":"Long","profit":"100"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestTaoLenhTruongLaLa400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"entered_at":"2026-06-09T12:00:00Z","symbol":"X","direction":"Long","profit":"1","truong_bia":"x"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestDanhSachLenhPhanTrangVaTotal(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	for i := 0; i < 3; i++ {
		taoLenh(t, srv.URL, tokenA, acc, bodyLenh)
	}

	resp, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/trades?page=1&size=2", srv.URL, acc), tokenA, "")

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var p struct {
		Items []map[string]any `json:"items"`
		Page  int              `json:"page"`
		Size  int              `json:"size"`
		Total int              `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &p))
	require.Len(t, p.Items, 2)
	require.Equal(t, 1, p.Page)
	require.Equal(t, 2, p.Size)
	require.Equal(t, 3, p.Total)
	require.EqualValues(t, 3, p.Items[0]["stt"], "mới nhất trước")
}

func TestDanhSachLenhRongTraMangRongChuKhongNull(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, "")

	require.Contains(t, string(env.Data), `"items":[]`)
}

func TestDanhSachLenhLocTheoSymbol(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"50"}`)

	_, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/trades?symbol=EURUSD", srv.URL, acc), tokenA, "")

	var p struct {
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &p))
	require.Equal(t, 1, p.Total)
	require.Equal(t, "EURUSD", p.Items[0]["symbol"])
	require.Equal(t, "148", p.Items[0]["cum_by_trade"],
		"lũy kế vẫn tính trên TOÀN BỘ dãy (98 + 50) dù bộ lọc chỉ giữ một lệnh")
}

func TestSuaLenhChiDoiTruongDuocGui(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	id := taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	resp, env := do(t, http.MethodPatch, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), tokenA,
		`{"notes":"đã xem lại"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var got map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &got))
	require.Equal(t, "đã xem lại", got["notes"])
	require.Equal(t, "XAUUSD", got["symbol"])
	require.EqualValues(t, 1, got["stt"])
}

func TestXoaMemRoiKhoiPhuc(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	id := taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	resp, _ := do(t, http.MethodDelete, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, "")
	require.Contains(t, string(env.Data), `"total":0`)

	_, env = do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades/trash", srv.URL, acc), tokenA, "")
	var rac []map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &rac))
	require.Len(t, rac, 1)
	require.EqualValues(t, id, rac[0]["id"])

	resp, _ = do(t, http.MethodPost, fmt.Sprintf("%s/api/trades/%d/restore", srv.URL, id), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, env = do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, "")
	require.Contains(t, string(env.Data), `"total":1`)
}

// Quyền sở hữu. Không có nhánh này thì bất kỳ ai đăng nhập đều đọc và sửa
// được lệnh của người khác chỉ bằng cách đoán id.
func TestLenhCuaNguoiKhacLa403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	id := taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	for _, c := range []struct {
		method, url string
		body        string
	}{
		{http.MethodGet, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), ""},
		{http.MethodPatch, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), `{"notes":"cua toi"}`},
		{http.MethodDelete, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), ""},
		{http.MethodPost, fmt.Sprintf("%s/api/trades/%d/restore", srv.URL, id), ""},
	} {
		t.Run(c.method, func(t *testing.T) {
			resp, env := do(t, c.method, c.url, tokenB, c.body)
			require.Equal(t, http.StatusForbidden, resp.StatusCode)
			require.Equal(t, 1403, env.Code)
		})
	}
}

func TestKhongCoTokenLa401(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), "", "")

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, 1401, env.Code)
}

func TestLenhKhongTonTaiLa404(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodGet, srv.URL+"/api/trades/999999", tokenA, "")

	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	require.Equal(t, 1404, env.Code)
}

func TestStatsTinhTrenTapDaLocQuaAPI(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"50"}`)

	_, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/stats?symbol=EURUSD", srv.URL, acc), tokenA, "")

	var k map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &k))
	require.EqualValues(t, 1, k["total_trades"])
	require.Equal(t, "50", k["net_profit"])
	require.Equal(t, "100", k["one_r"], "1R = 10000 × 0.01, không phụ thuộc bộ lọc")
}

func TestStatsKhongCoLenhThiChiSoRaNull(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/stats", srv.URL, acc), tokenA, "")

	require.Contains(t, string(env.Data), `"profit_factor":null`)
	require.Contains(t, string(env.Data), `"win_pct":null`)
	require.Contains(t, string(env.Data), `"current_balance":"10000"`)
	// T2: nạp/rút ròng là tile RIÊNG trên dashboard, không suy ra được từ
	// current_balance nên phải có mặt trong payload kể cả khi bằng 0.
	require.Contains(t, string(env.Data), `"net_cash_flow":"0"`)
}

func TestChartsTraDuMuoiBonKhoa(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/charts", srv.URL, acc), tokenA, "")

	var c map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(env.Data, &c))
	for _, khoa := range []string{
		"by_setup", "by_symbol", "by_timeframe", "by_direction", "by_weekday",
		"by_week", "by_day", "heatmap", "r_distribution", "score", "radar",
		"theory_vs_actual", "longest_win_streak", "longest_loss_streak",
		"execution", "by_trade_class", "win_loss", "theory_summary",
	} {
		require.Contains(t, c, khoa, "thiếu nhóm %q", khoa)
	}
	require.Len(t, c, 18, "đúng 18 khoá, không thừa không thiếu")
}

// capNhatGolden cho phép sinh lại file mẫu khi hình dạng ĐỔI CÓ CHỦ Ý:
//
//	go test ./internal/httpapi/ -run TestChartsGiuNguyenHinhDangJSON -cap-nhat-golden
//
// Cờ này là con dao hai lưỡi: chạy nó vô thức sẽ "sửa" test thay vì sửa lỗi.
// Chỉ dùng khi đã đọc diff và xác nhận thay đổi là điều mình muốn.
var capNhatGolden = flag.Bool("cap-nhat-golden", false, "ghi lại file golden của /charts")

func TestChartsGiuNguyenHinhDangJSON(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	// Fixture cố định: hai lệnh, một thắng một thua, đủ để mọi nhóm có dữ
	// liệu thật thay vì toàn giá trị rỗng.
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100","fee":"2","profit_theory":"120","timeframe":"H1","setup":"Breakout","entry_quality":"Đúng kế hoạch","in_trade_quality":"Tuân thủ kế hoạch","exit_quality":"Chạm Chốt lời","psychology":"Không lỗi"}`)
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"-50","fee":"1","profit_theory":"-40","timeframe":"M15","setup":"Pullback","entry_quality":"Bốc đồng","in_trade_quality":"Dời dừng lỗ ra xa","exit_quality":"Chạm Dừng lỗ","psychology":"SỢ BỎ LỠ (FOMO)"}`)

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/charts", srv.URL, acc), tokenA, "")

	// Chuẩn hoá qua map rồi in lại có thụt lề: so sánh không phụ thuộc thứ
	// tự khoá mà encoding/json sinh ra.
	var thuc any
	require.NoError(t, json.Unmarshal(env.Data, &thuc))
	dep, err := json.MarshalIndent(thuc, "", "  ")
	require.NoError(t, err)

	duong := filepath.Join("testdata", "charts.golden.json")
	if *capNhatGolden {
		require.NoError(t, os.MkdirAll("testdata", 0o755))
		require.NoError(t, os.WriteFile(duong, append(dep, '\n'), 0o644))
		t.Log("đã ghi lại", duong)
		return
	}

	muon, err := os.ReadFile(duong)
	require.NoError(t, err, "chưa có file golden — chạy lại với -cap-nhat-golden")
	require.JSONEq(t, string(muon), string(dep),
		"hình dạng JSON của /charts đã đổi. Nếu đây là chủ ý, chạy lại với -cap-nhat-golden và đọc kỹ diff")
}

// /facets cấp danh sách cho hai ô lọc "mã sản phẩm" và "setup" ở frontend.
func TestFacetsTraSymbolVaSetupDaDung(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "FACET")

	for _, b := range []string{
		`{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"10","fee":"0","setup":"Pullback"}`,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Long","profit":"10","fee":"0","setup":"Breakout"}`,
		`{"entered_at":"2026-06-11T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"10","fee":"0","setup":"Breakout"}`,
	} {
		taoLenh(t, srv.URL, tokenA, acc, b)
	}

	resp, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades/facets", srv.URL, acc), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var got struct {
		Symbols []string `json:"symbols"`
		Setups  []string `json:"setups"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &got))
	require.Equal(t, []string{"EURUSD", "XAUUSD"}, got.Symbols)
	require.Equal(t, []string{"Breakout", "Pullback"}, got.Setups)

	// Account của người khác: middleware chặn trước khi chạm dữ liệu.
	resp, _ = do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades/facets", srv.URL, acc), tokenB, "")
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// Mảng rỗng chứ không phải null: frontend đọc thẳng vào `.map` mà không phải
// phòng thủ ở từng chỗ dùng.
func TestFacetsAccountTrongTraMangRong(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "FACET0")

	resp, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades/facets", srv.URL, acc), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `{"symbols":[],"setups":[]}`, string(env.Data))
}
