// Package importer đọc file CSV xuất từ bản Excel gốc và dựng []domain.Trade.
//
// Package THUẦN: không import GORM, net/http, database/sql hay context. Nó
// nhận io.Reader và một *time.Location, trả struct. Nhờ vậy toàn bộ test của
// nó chạy trong `make test-pure`, không cần Docker.
//
// Đây cũng là chỗ DUY NHẤT biết layout file cũ: tên cột tiếng Việt của
// trading-journal-plan.md §0 và mapping BUY/SELL → Long/Short của §1.
package importer

import (
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
)

// NormalizeDirection uỷ thác cho domain: mapping BUY/SELL → Long/Short là
// luật NGHIỆP VỤ (trading-journal-plan.md §1), không phải luật của định dạng
// file, nên nó thuộc về domain chứ không phải package này.
//
// Giữ hàm ở đây làm lớp mỏng để test cũ và chỗ gọi cũ không phải đổi tên.
func NormalizeDirection(s string) (string, error) {
	return domain.NormalizeDirection(s)
}

// cleanNumber bóc những thứ Excel hay chèn quanh một con số.
//
// Ba thứ gặp thật trong file xuất ra từ Excel: dấu phẩy ngăn nghìn, ký hiệu
// tiền tệ, và lối kế toán viết số âm trong ngoặc đơn.
func cleanNumber(s string) (string, bool) {
	v := strings.TrimSpace(s)
	if v == "" {
		return "", false
	}

	// (500) là −500 theo quy ước kế toán. Xử lý trước khi bóc ký tự khác để
	// cặp ngoặc còn nguyên mà nhận diện.
	am := false
	if strings.HasPrefix(v, "(") && strings.HasSuffix(v, ")") {
		am = true
		v = v[1 : len(v)-1]
	}

	var b strings.Builder
	for _, r := range v {
		switch {
		case r >= '0' && r <= '9', r == '.', r == '-', r == '+':
			b.WriteRune(r)
		case r == ',', r == ' ', r == ' ':
			// ngăn nghìn hoặc khoảng trắng — bỏ
		case r == '$' || r == '€' || r == '£' || r == '¥' || r == '₫':
			// ký hiệu tiền tệ — bỏ
		default:
			// Ký tự lạ giữ nguyên để decimal.NewFromString báo lỗi. Nuốt nó
			// đi sẽ biến "12abc" thành 12 — im lặng và sai.
			b.WriteRune(r)
		}
	}
	out := b.String()
	if am {
		out = "-" + out
	}
	return out, true
}

// ParseMoney đọc một ô tiền. Ô rỗng cho 0.
//
// Dùng decimal.NewFromString, KHÔNG BAO GIỜ ParseFloat: quy tắc 1 của
// CLAUDE.md. Một lần đi qua float64 là mất chữ số, và mất im lặng.
func ParseMoney(s string) (decimal.Decimal, error) {
	clean, hasValue := cleanNumber(s)
	if !hasValue {
		return decimal.Zero, nil
	}
	d, err := decimal.NewFromString(clean)
	if err != nil {
		return decimal.Zero, fmt.Errorf("%q không phải số hợp lệ", strings.TrimSpace(s))
	}
	return d, nil
}

// ParseMoneyPtr như ParseMoney nhưng ô rỗng cho nil.
//
// Dành cho profit_theory: rỗng nghĩa là CHƯA NHẬP, khác hẳn 0 nghĩa là lý
// thuyết hoà vốn. Gộp hai thứ lại là bịa ra một con số người dùng chưa từng gõ.
func ParseMoneyPtr(s string) (*decimal.Decimal, error) {
	if _, hasValue := cleanNumber(s); !hasValue {
		return nil, nil
	}
	d, err := ParseMoney(s)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// dateFormats là các layout được chấp nhận, thử theo thứ tự.
//
// Thứ tự có ý nghĩa: "09/06/2026" mơ hồ giữa ngày/tháng và tháng/ngày. Chọn
// ngày trước (kiểu Việt Nam / châu Âu) vì file gốc là file của người dùng
// Việt. Định dạng ISO đứng đầu vì nó không mơ hồ.
var dateFormats = []string{
	"2006-01-02",
	"2006/01/02",
	"02/01/2006",
	"2/1/2006",
	"02-01-2006",
	"2-1-2006",
}

// ParseDay đổi một ô ngày thành thời điểm UTC để lưu vào entered_at.
//
// Giờ trong ngày chốt ở 12:00 THEO TIMEZONE CỦA ACCOUNT, không phải 00:00.
// Lý do: day là trường suy diễn tính bằng entered_at.In(acc.Timezone), nên
// một lệnh đặt ở 00:00 chỉ cần lệch một giờ là rơi sang ngày hôm trước.
// Giữa trưa thì không phép quy đổi nào đẩy nó ra khỏi ngày của chính nó.
//
// File cũ chỉ có cột Day, không có giờ — đây chính là chỗ thông tin bị thiếu
// và ta phải chọn một quy ước. Chọn quy ước an toàn nhất.
func ParseDay(s string, loc *time.Location) (time.Time, error) {
	v := strings.TrimSpace(s)
	if v == "" {
		return time.Time{}, fmt.Errorf("ngày không được để trống")
	}
	// Excel đôi khi kèm phần giờ vào ô ngày khi xuất CSV; cắt bỏ, ta chỉ
	// dùng phần ngày.
	if i := strings.IndexAny(v, " T"); i > 0 {
		v = v[:i]
	}
	for _, layout := range dateFormats {
		// ParseInLocation chứ không Parse: Parse coi chuỗi không mang offset
		// là UTC, và như thế ngày sẽ lệch với timezone của account.
		if t, err := time.ParseInLocation(layout, v, loc); err == nil {
			return time.Date(t.Year(), t.Month(), t.Day(), 12, 0, 0, 0, loc).UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("ngày %q không đọc được (nhận yyyy-mm-dd hoặc dd/mm/yyyy)", strings.TrimSpace(s))
}
