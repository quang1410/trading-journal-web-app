package importer

import (
	"bufio"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"journal/internal/csvformat"
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
	sep, err := readDecimalSeparator(br)
	if err != nil {
		return Report{}, err
	}

	cr := csv.NewReader(br)
	cr.Comma = sep
	// Dòng ngắn/dài hơn header không phải lỗi cấu trúc: Excel cắt cụt ô cuối
	// rất thường xuyên. Xử lý bằng cách đọc an toàn ở cellAt.
	cr.FieldsPerRecord = -1
	// LazyQuotes CÓ ĐÁNH ĐỔI, và đây là lựa chọn có chủ ý. Nó cho qua dấu nháy
	// lẻ giữa ô đã trích dẫn — Excel xuất ra file như vậy thật — nhưng đổi lại
	// một dòng hỏng thật sẽ parse ra giá trị SAI thay vì báo lỗi. Chọn vế này
	// vì file nguồn là Excel của người dùng, không phải dữ liệu máy sinh: từ
	// chối cả file vì một dấu nháy lạc thì tính năng nhập trở nên vô dụng.
	cr.LazyQuotes = true

	header, err := cr.Read()
	if err != nil {
		return Report{}, fmt.Errorf("không đọc được dòng tiêu đề: %w", err)
	}
	positions, err := detectColumns(header)
	if err != nil {
		return Report{}, err
	}

	rep := Report{Rows: []domain.Trade{}, Errors: []RowError{}}
	// Dòng 1 là header; dòng dữ liệu đầu tiên là 2. Đánh số theo cái người
	// dùng nhìn thấy trong Excel, không theo chỉ số slice.
	lineNo := 1
	for {
		rec, err := cr.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		lineNo++
		if err != nil {
			rep.Errors = append(rep.Errors, RowError{Line: lineNo, Column: "", Msg: err.Error()})
			continue
		}
		if isBlankRow(rec) {
			rep.Skipped++
			continue
		}
		tr, rowErr := buildTrade(rec, positions, header, loc, lineNo)
		if rowErr != nil {
			rep.Errors = append(rep.Errors, *rowErr)
			continue
		}
		rep.Rows = append(rep.Rows, tr)
	}
	return rep, nil
}

// readDecimalSeparator ngó dòng đầu để đoán dấu phân cách, rồi nuốt BOM nếu có.
//
// Excel ở locale châu Âu xuất CSV bằng dấu chấm phẩy. Đoán sai thì cả file
// thành một cột duy nhất và mọi cột bắt buộc đều "thiếu" — thông điệp lỗi sẽ
// chỉ sai hướng hoàn toàn.
func readDecimalSeparator(br *bufio.Reader) (rune, error) {
	// Nuốt BOM: csv.Reader không tự bỏ, và BOM dính vào tên cột đầu tiên
	// khiến "Day" thành "<BOM>Day".
	if bom, err := br.Peek(3); err == nil && string(bom) == "\uFEFF" {
		_, _ = br.Discard(3)
	}

	sep, err := br.Peek(4096)
	if err != nil && !errors.Is(err, io.EOF) {
		return 0, fmt.Errorf("không đọc được file: %w", err)
	}
	firstLine := string(sep)
	if i := strings.IndexAny(firstLine, "\r\n"); i >= 0 {
		firstLine = firstLine[:i]
	}
	if strings.TrimSpace(firstLine) == "" {
		return 0, errors.New("file rỗng hoặc không có dòng tiêu đề")
	}
	if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
		return ';', nil
	}
	return ',', nil
}

func isBlankRow(rec []string) bool {
	for _, cell := range rec {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

// buildTrade dựng một lệnh từ một dòng. Dừng ở LỖI ĐẦU TIÊN.
//
// Một dòng một lỗi là đủ: người dùng sửa ô đó rồi chạy lại, và danh sách lỗi
// ngắn thì đọc được. Liệt kê cả 5 lỗi của cùng một dòng chỉ làm bảng preview
// dài ra mà không giúp sửa nhanh hơn.
func buildTrade(rec []string, positions map[string]int, header []string, loc *time.Location, lineNo int) (domain.Trade, *RowError) {
	// cellAt đọc an toàn: cột không có trong file, hoặc dòng ngắn hơn header,
	// đều cho chuỗi rỗng thay vì panic.
	cellAt := func(field string) string {
		i, ok := positions[field]
		if !ok || i >= len(rec) {
			return ""
		}
		return strings.TrimSpace(rec[i])
	}
	headerName := func(field string) string {
		if i, ok := positions[field]; ok && i < len(header) {
			return strings.TrimSpace(header[i])
		}
		return field
	}
	rowErr := func(field string, err error) *RowError {
		return &RowError{Line: lineNo, Column: headerName(field), Msg: err.Error()}
	}

	var t domain.Trade

	enteredAt, err := ParseDay(cellAt("day"), loc)
	if err != nil {
		return t, rowErr("day", err)
	}
	t.EnteredAt = enteredAt

	t.Symbol = stripLeadingQuote(cellAt("symbol"))
	if t.Symbol == "" {
		return t, rowErr("symbol", errors.New("mã sản phẩm không được để trống"))
	}

	if t.Direction, err = NormalizeDirection(cellAt("direction")); err != nil {
		return t, rowErr("direction", err)
	}

	if t.Entry, err = ParseMoneyPtr(cellAt("entry")); err != nil {
		return t, rowErr("entry", err)
	}
	if t.Exit, err = ParseMoneyPtr(cellAt("exit")); err != nil {
		return t, rowErr("exit", err)
	}
	if t.Volume, err = ParseMoneyPtr(cellAt("volume")); err != nil {
		return t, rowErr("volume", err)
	}
	if t.ProfitTheory, err = ParseMoneyPtr(cellAt("profit_theory")); err != nil {
		return t, rowErr("profit_theory", err)
	}
	if t.Profit, err = ParseMoney(cellAt("profit")); err != nil {
		return t, rowErr("profit", err)
	}
	if t.Fee, err = ParseMoney(cellAt("fee")); err != nil {
		return t, rowErr("fee", err)
	}

	// Năm cột enum dùng CHUNG bảng luật với đường tạo lệnh và đường sửa lệnh
	// (domain.TradeEnumFields). Trước đây bảng này được chép lại ngay tại đây,
	// và bản chép có thể trôi lệch khỏi bản của service mà không test nào bắt.
	for _, f := range domain.TradeEnumFields {
		v, err := f.MatchEnum(cellAt(f.Name))
		if err != nil {
			return t, rowErr(f.Name, err)
		}
		*f.Ref(&t) = v
	}

	// Setup do người dùng tự đặt, không có danh sách hợp lệ. Rỗng về mặc
	// định — luật nằm ở domain.NormalizeSetup, dùng chung với hai đường kia.
	t.Setup = domain.NormalizeSetup(stripLeadingQuote(cellAt("setup")))
	t.Notes = stripLeadingQuote(cellAt("notes"))

	return t, nil
}

// stripLeadingQuote gỡ nháy đơn dẫn đầu khỏi ô CHỮ TỰ DO.
//
// Uỷ thác cho csvformat.Unescape — nghịch đảo của csvformat.Escape mà
// exporter dùng. Hai nửa nằm cạnh nhau ở một package, nên sửa một nửa mà
// quên nửa kia là chuyện không làm được nữa.
func stripLeadingQuote(s string) string { return csvformat.Unescape(s) }
