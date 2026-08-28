package httpapi_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/service"
)

const csvImport = `Day,Symbol,Long/ Short,Profit,Phí,Setup,Timeframe
2026-06-09,XAUUSD,BUY,500,10,BOS,H4
2026-06-10,EURUSD,SELL,-200,5,BOS,H1
`

// upload gửi multipart tới endpoint import. tenField cho phép test trường hợp
// gửi sai tên field.
func upload(t *testing.T, url, token, tenField, tenFile, noiDung string) (*http.Response, envelopeBody) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if tenField != "" {
		fw, err := w.CreateFormFile(tenField, tenFile)
		require.NoError(t, err)
		_, err = fw.Write([]byte(noiDung))
		require.NoError(t, err)
	}
	require.NoError(t, w.Close())

	req, err := http.NewRequest(http.MethodPost, url, &buf)
	require.NoError(t, err)
	req.Header.Set("Content-Type", w.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	var env envelopeBody
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	return resp, env
}

type baoCaoImport struct {
	Valid     int  `json:"valid"`
	Skipped   int  `json:"skipped"`
	Committed bool `json:"committed"`
	Errors    []struct {
		Line   int    `json:"line"`
		Column string `json:"column"`
		Msg    string `json:"msg"`
	} `json:"errors"`
}

func demLenh(t *testing.T, srv, token string, acc int64) int {
	t.Helper()
	resp, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv, acc), token, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var page struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &page))
	return page.Total
}

func TestImportDryRunTraBaoCaoVaKhongGhi(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=true", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)
	var bc baoCaoImport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.Equal(t, 2, bc.Valid)
	require.Empty(t, bc.Errors)
	require.False(t, bc.Committed)

	require.Zero(t, demLenh(t, srv.URL, tokenA, acc), "dry-run không được ghi")
}

// File quá cỡ phải báo ĐÚNG lý do. MaxBytesReader bật lỗi ngay trong
// ParseMultipartForm, nên nếu handler không tách nguyên nhân ra thì người
// dùng nhận câu "multipart hỏng" và đi sửa cách gửi form — trong khi việc
// cần làm là tách nhỏ file. Đây lại đúng là lỗi hay gặp nhất của tính năng
// này: nhập cả lịch sử giao dịch cũ từ Excel.
func TestImportFileQuaCoBaoDungLyDo(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	to := csvImport + strings.Repeat("2026-06-09,XAUUSD,BUY,500,10,BOS,H4\n", 200000)
	require.Greater(t, len(to), service.MaxImportBytes, "phải vượt trần thì test mới có nghĩa")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=true", srv.URL, acc),
		tokenA, "file", "to.csv", to)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.NotEqual(t, 0, env.Code)
	require.Contains(t, env.Msg, "vượt quá", "phải nói file to, không nói multipart hỏng")
	require.NotContains(t, env.Msg, "multipart")

	require.Zero(t, demLenh(t, srv.URL, tokenA, acc))
}

// Mặc định phải là nhánh AN TOÀN. Thiếu tham số mà lại ghi thẳng vào DB là
// kiểu lỗi chỉ lộ ra khi dữ liệu thật đã nằm trong đó.
func TestImportKhongCoThamSoThiMacDinhLaDryRun(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var bc baoCaoImport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.False(t, bc.Committed, "thiếu dry_run phải coi như dry-run")
	require.Zero(t, demLenh(t, srv.URL, tokenA, acc))
}

func TestImportGhiThatKhiDryRunFalse(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var bc baoCaoImport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.True(t, bc.Committed)
	require.Equal(t, 2, demLenh(t, srv.URL, tokenA, acc))
}

func TestImportDongHongTraLoiTungDongKemSoDong(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	hong := "Day,Symbol,Long/ Short,Profit\n2026-06-09,XAUUSD,RAC,500\n"
	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenA, "file", "lenh.csv", hong)

	require.Equal(t, http.StatusOK, resp.StatusCode, "dòng hỏng là dữ liệu báo cáo, không phải lỗi HTTP")
	var bc baoCaoImport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.Len(t, bc.Errors, 1)
	require.Equal(t, 2, bc.Errors[0].Line)
	require.Equal(t, "Long/ Short", bc.Errors[0].Column)
	require.False(t, bc.Committed)
	require.Zero(t, demLenh(t, srv.URL, tokenA, acc))
}

func TestImportThieuFieldFileLa400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		tokenA, "", "", "")

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
	require.NotEmpty(t, env.Msg)
}

func TestImportFileThieuCotBatBuocLa400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		tokenA, "file", "lenh.csv", "Symbol,Profit\nXAUUSD,100\n")

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestImportAccountCuaNguoiKhacLa403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenB, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Zero(t, demLenh(t, srv.URL, tokenA, acc))
}

func TestImportChuaDangNhapLa401(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		"", "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// Import xong thì lệnh phải đi qua đúng đường đọc thật: có stt, có trường
// suy diễn, và day tính theo timezone của account.
func TestImportXongDocLaiThayTruongSuyDien(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	_, _ = upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	resp, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var page struct {
		Items []map[string]any `json:"items"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &page))
	require.Len(t, page.Items, 2)

	// Danh sách trả mới nhất trước, nên phần tử đầu là lệnh ngày 10.
	moi := page.Items[0]
	require.Equal(t, "2026-06-10", moi["day"])
	require.Equal(t, "Short", moi["direction"], "SELL phải thành Short")
	require.Equal(t, "-205", moi["net"])
	require.EqualValues(t, 2, moi["stt"])
}

// ---- Export ----

func TestExportTraFileCSV(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	resp, body := tai(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv", srv.URL, acc), tokenA)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, resp.Header.Get("Content-Type"), "text/csv")
	require.Contains(t, resp.Header.Get("Content-Disposition"), "attachment")
	require.Contains(t, resp.Header.Get("Content-Disposition"), ".csv")

	require.Contains(t, body, "STT", "phải có dòng header")
	require.Contains(t, body, "XAUUSD")
	require.Contains(t, body, "98", "net = 100 − 2")
}

// Export phải khớp cái người dùng ĐANG NHÌN THẤY, nên nó nhận cùng bộ lọc
// như GET /trades.
func TestExportTheoBoLoc(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"50"}`)

	_, body := tai(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv?symbol=EURUSD", srv.URL, acc), tokenA)

	require.Contains(t, body, "EURUSD")
	require.NotContains(t, body, "XAUUSD", "bộ lọc phải được áp dụng")
}

func TestExportAccountRongVanCoHeader(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, body := tai(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv", srv.URL, acc), tokenA)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, body, "STT")
	require.Equal(t, 1, strings.Count(strings.TrimSpace(body), "\n")+1, "chỉ một dòng header")
}

func TestExportAccountCuaNguoiKhacLa403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := tai(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv", srv.URL, acc), tokenB)
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// tai tải một endpoint trả file, không bọc envelope.
func tai(t *testing.T, url, token string) (*http.Response, string) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	require.NoError(t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	var b bytes.Buffer
	_, err = b.ReadFrom(resp.Body)
	require.NoError(t, err)
	return resp, b.String()
}
