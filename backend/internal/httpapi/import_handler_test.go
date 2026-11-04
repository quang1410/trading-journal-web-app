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
func upload(t *testing.T, url, token, fieldName, fileName, content string) (*http.Response, envelopeBody) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if fieldName != "" {
		fw, err := w.CreateFormFile(fieldName, fileName)
		require.NoError(t, err)
		_, err = fw.Write([]byte(content))
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

type importReport struct {
	Valid     int  `json:"valid"`
	Skipped   int  `json:"skipped"`
	Committed bool `json:"committed"`
	Errors    []struct {
		Line   int    `json:"line"`
		Column string `json:"column"`
		Msg    string `json:"msg"`
	} `json:"errors"`
	// Khai lại bằng TAY chứ không dùng service.PreviewRow: đây là hợp đồng
	// JSON với frontend, và một struct chép tay ở phía đọc là thứ duy nhất
	// bắt được việc ai đó đổi tên json tag bên kia.
	Preview []struct {
		Day       string  `json:"day"`
		Symbol    string  `json:"symbol"`
		Direction string  `json:"direction"`
		Entry     *string `json:"entry"`
		Exit      *string `json:"exit"`
		Volume    *string `json:"volume"`
		Profit    string  `json:"profit"`
		Fee       string  `json:"fee"`
	} `json:"preview"`
}

func countTrades(t *testing.T, srv, token string, acc int64) int {
	t.Helper()
	resp, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv, acc), token, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var page struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &page))
	return page.Total
}

func TestImportDryRunReturnsReportAndWritesNothing(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=true", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)
	var bc importReport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.Equal(t, 2, bc.Valid)
	require.Empty(t, bc.Errors)
	require.False(t, bc.Committed)

	require.Zero(t, countTrades(t, srv.URL, tokenA, acc), "dry-run không được ghi")
}

// File quá cỡ phải báo ĐÚNG lý do. MaxBytesReader bật lỗi ngay trong
// ParseMultipartForm, nên nếu handler không tách nguyên nhân ra thì người
// dùng nhận câu "multipart hỏng" và đi sửa cách gửi form — trong khi việc
// cần làm là tách nhỏ file. Đây lại đúng là lỗi hay gặp nhất của tính năng
// này: nhập cả lịch sử giao dịch cũ từ Excel.
func TestImportOversizeFileReportsCorrectReason(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	to := csvImport + strings.Repeat("2026-06-09,XAUUSD,BUY,500,10,BOS,H4\n", 200000)
	require.Greater(t, len(to), service.MaxImportBytes, "phải vượt trần thì test mới có nghĩa")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=true", srv.URL, acc),
		tokenA, "file", "to.csv", to)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.NotEqual(t, 0, env.Code)
	require.Contains(t, env.Msg, "vượt quá", "phải nói file to, không nói multipart hỏng")
	require.NotContains(t, env.Msg, "multipart")

	require.Zero(t, countTrades(t, srv.URL, tokenA, acc))
}

// Mặc định phải là nhánh AN TOÀN. Thiếu tham số mà lại ghi thẳng vào DB là
// kiểu lỗi chỉ lộ ra khi dữ liệu thật đã nằm trong đó.
func TestImportDefaultsToDryRunWithoutParam(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var bc importReport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.False(t, bc.Committed, "thiếu dry_run phải coi như dry-run")
	require.Zero(t, countTrades(t, srv.URL, tokenA, acc))
}

func TestImportWritesForRealWhenDryRunFalse(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var bc importReport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.True(t, bc.Committed)
	require.Equal(t, 2, countTrades(t, srv.URL, tokenA, acc))
}

func TestImportBadRowReturnsPerRowErrorWithLineNumber(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	broken := "Day,Symbol,Long/ Short,Profit\n2026-06-09,XAUUSD,RAC,500\n"
	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenA, "file", "lenh.csv", broken)

	require.Equal(t, http.StatusOK, resp.StatusCode, "dòng hỏng là dữ liệu báo cáo, không phải lỗi HTTP")
	var bc importReport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.Len(t, bc.Errors, 1)
	require.Equal(t, 2, bc.Errors[0].Line)
	require.Equal(t, "Long/ Short", bc.Errors[0].Column)
	require.False(t, bc.Committed)
	require.Zero(t, countTrades(t, srv.URL, tokenA, acc))
}

func TestImportMissingFileFieldIs400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		tokenA, "", "", "")

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
	require.NotEmpty(t, env.Msg)
}

func TestImportMissingRequiredColumnIs400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		tokenA, "file", "lenh.csv", "Symbol,Profit\nXAUUSD,100\n")

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestImportAnotherUsersAccountIs403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenB, "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Zero(t, countTrades(t, srv.URL, tokenA, acc))
}

func TestImportUnauthenticatedIs401(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := upload(t, fmt.Sprintf("%s/api/accounts/%d/import", srv.URL, acc),
		"", "file", "lenh.csv", csvImport)

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// Import xong thì lệnh phải đi qua đúng đường đọc thật: có stt, có trường
// suy diễn, và day tính theo timezone của account.
func TestImportThenReadBackShowsDerivedFields(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

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
	fresh := page.Items[0]
	require.Equal(t, "2026-06-10", fresh["day"])
	require.Equal(t, "Short", fresh["direction"], "SELL phải thành Short")
	require.Equal(t, "-205", fresh["net"])
	require.EqualValues(t, 2, fresh["stt"])
}

// ---- Export ----

func TestExportReturnsCSVFile(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")
	makeTrade(t, srv.URL, tokenA, acc, tradeBody)

	resp, body := at(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv", srv.URL, acc), tokenA)

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
func TestExportRespectsFilter(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")
	makeTrade(t, srv.URL, tokenA, acc, tradeBody)
	makeTrade(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"50"}`)

	_, body := at(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv?symbol=EURUSD", srv.URL, acc), tokenA)

	require.Contains(t, body, "EURUSD")
	require.NotContains(t, body, "XAUUSD", "bộ lọc phải được áp dụng")
}

func TestExportEmptyAccountStillHasHeader(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, body := at(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv", srv.URL, acc), tokenA)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, body, "STT")
	require.Equal(t, 1, strings.Count(strings.TrimSpace(body), "\n")+1, "chỉ một dòng header")
}

func TestExportAnotherUsersAccountIs403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := at(t, fmt.Sprintf("%s/api/accounts/%d/trades.csv", srv.URL, acc), tokenB)
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// at tải một endpoint trả file, không bọc envelope.
func at(t *testing.T, url, token string) (*http.Response, string) {
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

// Preview đi qua HTTP đúng hình dạng frontend chờ, và TIỀN LÀ CHUỖI.
//
// Ghim ở tầng này chứ không chỉ ở service vì đây là chỗ hợp đồng thật nằm:
// nếu decimal.Decimal bị đổi sang float64 ở đâu đó, test service so bằng
// decimal.Equal vẫn xanh, còn JSON thì đã âm thầm ra số — và frontend mất
// chữ số. Khai Profit là `string` ở struct đọc trên kia làm việc đó lộ ra
// bằng lỗi unmarshal.
func TestImportPreviewReturnsParsedRowsOverHTTP(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	_, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=true", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	var bc importReport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.Len(t, bc.Preview, 2)

	require.Equal(t, "2026-06-09", bc.Preview[0].Day)
	require.Equal(t, "XAUUSD", bc.Preview[0].Symbol)
	require.Equal(t, "Long", bc.Preview[0].Direction, "BUY phải hiện ra là Long")
	require.Equal(t, "500", bc.Preview[0].Profit)
	require.Equal(t, "10", bc.Preview[0].Fee)
	require.Nil(t, bc.Preview[0].Entry, "cột Entry không có trong file: chưa nhập, không phải 0")

	require.Equal(t, "Short", bc.Preview[1].Direction)
	require.Equal(t, "-200", bc.Preview[1].Profit)
}

// Preview có mặt ở CẢ lần ghi thật, không chỉ dry-run.
//
// Người dùng bấm nhập xong vẫn cần thấy mình vừa ghi cái gì; trả preview rỗng
// ở nhánh commit sẽ làm bảng biến mất đúng lúc nó có ích nhất.
func TestImportPreviewPresentOnRealWrite(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := makeAccountViaAPI(t, srv.URL, tokenA, "A1")

	_, env := upload(t, fmt.Sprintf("%s/api/accounts/%d/import?dry_run=false", srv.URL, acc),
		tokenA, "file", "lenh.csv", csvImport)

	var bc importReport
	require.NoError(t, json.Unmarshal(env.Data, &bc))
	require.True(t, bc.Committed)
	require.Len(t, bc.Preview, 2)
}
