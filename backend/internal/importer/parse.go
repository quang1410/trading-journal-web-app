package importer

import (
	"bufio"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"journal/internal/domain"
)

// RowError là một ô hỏng, đủ thông tin để người dùng mở file lên và sửa đúng chỗ.
type RowError struct {
	Line   int    `json:"line"`   // số dòng trong file, TÍNH CẢ header (dòng 1)
	Column string `json:"column"` // tên cột như trong file
	Msg    string `json:"msg"`
}

// Report là kết quả một lần đọc file.
//
// Rows và Errors cùng tồn tại: một file có thể vừa có dòng đọc được vừa có
// dòng hỏng, và người dùng cần thấy CẢ HAI để quyết định. Việc "có lỗi thì
// có ghi không" là quyết định của service, không phải của parser.
type Report struct {
	Rows    []domain.Trade `json:"-"`
	Errors  []RowError     `json:"errors"`
	Skipped int            `json:"skipped"` // dòng trống bị bỏ qua
}

// Parse đọc CSV và dựng []domain.Trade.
//
// Trả error CHỈ khi cả file không dùng được (rỗng, thiếu cột bắt buộc, CSV
// hỏng cấu trúc). Dòng hỏng lẻ tẻ đi vào Report.Errors — file 500 dòng có 3
// dòng sai vẫn phải xem được 497 dòng kia.
//
// AccountID và STT cố ý để trống: account suy từ URL, còn stt do repository
// cấp (quy tắc 7 của CLAUDE.md).
func Parse(r io.Reader, loc *time.Location) (Report, error) {
	br := bufio.NewReader(r)
	dau, err := doDauPhanCach(br)
	if err != nil {
		return Report{}, err
	}

	cr := csv.NewReader(br)
	cr.Comma = dau
	// Dòng ngắn/dài hơn header không phải lỗi cấu trúc: Excel cắt cụt ô cuối
	// rất thường xuyên. Xử lý bằng cách đọc an toàn ở lấyÔ.
	cr.FieldsPerRecord = -1
	cr.LazyQuotes = true

	header, err := cr.Read()
	if err != nil {
		return Report{}, fmt.Errorf("không đọc được dòng tiêu đề: %w", err)
	}
	viTri, err := nhanDienCot(header)
	if err != nil {
		return Report{}, err
	}

	rep := Report{Rows: []domain.Trade{}, Errors: []RowError{}}
	// Dòng 1 là header; dòng dữ liệu đầu tiên là 2. Đánh số theo cái người
	// dùng nhìn thấy trong Excel, không theo chỉ số slice.
	dong := 1
	for {
		ban, err := cr.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		dong++
		if err != nil {
			rep.Errors = append(rep.Errors, RowError{Line: dong, Column: "", Msg: err.Error()})
			continue
		}
		if dongTrong(ban) {
			rep.Skipped++
			continue
		}
		tr, loi := dungLenh(ban, viTri, header, loc, dong)
		if loi != nil {
			rep.Errors = append(rep.Errors, *loi)
			continue
		}
		rep.Rows = append(rep.Rows, tr)
	}
	return rep, nil
}

// doDauPhanCach ngó dòng đầu để đoán dấu phân cách, rồi nuốt BOM nếu có.
//
// Excel ở locale châu Âu xuất CSV bằng dấu chấm phẩy. Đoán sai thì cả file
// thành một cột duy nhất và mọi cột bắt buộc đều "thiếu" — thông điệp lỗi sẽ
// chỉ sai hướng hoàn toàn.
func doDauPhanCach(br *bufio.Reader) (rune, error) {
	// Nuốt BOM: csv.Reader không tự bỏ, và BOM dính vào tên cột đầu tiên
	// khiến "Day" thành "<BOM>Day".
	if bom, err := br.Peek(3); err == nil && string(bom) == "\uFEFF" {
		_, _ = br.Discard(3)
	}

	dau, err := br.Peek(4096)
	if err != nil && !errors.Is(err, io.EOF) {
		return 0, fmt.Errorf("không đọc được file: %w", err)
	}
	dongDau := string(dau)
	if i := strings.IndexAny(dongDau, "\r\n"); i >= 0 {
		dongDau = dongDau[:i]
	}
	if strings.TrimSpace(dongDau) == "" {
		return 0, errors.New("file rỗng hoặc không có dòng tiêu đề")
	}
	if strings.Count(dongDau, ";") > strings.Count(dongDau, ",") {
		return ';', nil
	}
	return ',', nil
}

func dongTrong(ban []string) bool {
	for _, o := range ban {
		if strings.TrimSpace(o) != "" {
			return false
		}
	}
	return true
}

// dungLenh dựng một lệnh từ một dòng. Dừng ở LỖI ĐẦU TIÊN.
//
// Một dòng một lỗi là đủ: người dùng sửa ô đó rồi chạy lại, và danh sách lỗi
// ngắn thì đọc được. Liệt kê cả 5 lỗi của cùng một dòng chỉ làm bảng preview
// dài ra mà không giúp sửa nhanh hơn.
func dungLenh(ban []string, viTri map[string]int, header []string, loc *time.Location, dong int) (domain.Trade, *RowError) {
	// lấyÔ đọc an toàn: cột không có trong file, hoặc dòng ngắn hơn header,
	// đều cho chuỗi rỗng thay vì panic.
	layO := func(truong string) string {
		i, có := viTri[truong]
		if !có || i >= len(ban) {
			return ""
		}
		return strings.TrimSpace(ban[i])
	}
	tenTrongFile := func(truong string) string {
		if i, có := viTri[truong]; có && i < len(header) {
			return strings.TrimSpace(header[i])
		}
		return truong
	}
	loi := func(truong string, err error) *RowError {
		return &RowError{Line: dong, Column: tenTrongFile(truong), Msg: err.Error()}
	}

	var t domain.Trade

	enteredAt, err := ParseDay(layO("day"), loc)
	if err != nil {
		return t, loi("day", err)
	}
	t.EnteredAt = enteredAt

	t.Symbol = layO("symbol")
	if t.Symbol == "" {
		return t, loi("symbol", errors.New("mã sản phẩm không được để trống"))
	}

	if t.Direction, err = NormalizeDirection(layO("direction")); err != nil {
		return t, loi("direction", err)
	}

	if t.Entry, err = ParseMoneyPtr(layO("entry")); err != nil {
		return t, loi("entry", err)
	}
	if t.Exit, err = ParseMoneyPtr(layO("exit")); err != nil {
		return t, loi("exit", err)
	}
	if t.Volume, err = ParseMoneyPtr(layO("volume")); err != nil {
		return t, loi("volume", err)
	}
	if t.ProfitTheory, err = ParseMoneyPtr(layO("profit_theory")); err != nil {
		return t, loi("profit_theory", err)
	}
	if t.Profit, err = ParseMoney(layO("profit")); err != nil {
		return t, loi("profit", err)
	}
	if t.Fee, err = ParseMoney(layO("fee")); err != nil {
		return t, loi("fee", err)
	}

	for _, o := range []struct {
		truong string
		hopLe  []string
		dich   *string
	}{
		{"timeframe", domain.Timeframes, &t.Timeframe},
		{"entry_quality", domain.EntryQualities, &t.EntryQuality},
		{"in_trade_quality", domain.InTradeQualities, &t.InTradeQuality},
		{"exit_quality", domain.ExitQualities, &t.ExitQuality},
		{"psychology", domain.Psychologies, &t.Psychology},
	} {
		v, err := NormalizeEnum(layO(o.truong), o.hopLe)
		if err != nil {
			return t, loi(o.truong, err)
		}
		*o.dich = v
	}

	// Setup do người dùng tự đặt, không có danh sách hợp lệ. Rỗng về mặc
	// định ở đây chứ không trông vào DEFAULT của cột — GORM luôn gửi mọi cột
	// nên DEFAULT không bao giờ được kích hoạt.
	t.Setup = layO("setup")
	if t.Setup == "" {
		t.Setup = domain.DefaultSetup
	}
	t.Notes = layO("notes")

	return t, nil
}
