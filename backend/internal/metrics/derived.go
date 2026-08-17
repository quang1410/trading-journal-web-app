// Package metrics tính trường suy diễn của từng lệnh và KPI toàn tài khoản
// theo trading-journal-plan.md §3 và §4. Thuần: không I/O, không DB.
package metrics

import (
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
)

// Net là lãi lỗ thực: profit trừ phí (§3.1).
func Net(t domain.Trade) decimal.Decimal {
	return t.Profit.Sub(t.Fee)
}

// WinLoss trả 1 khi net >= 0 (§3.2). Lưu ý net = 0 tính là KHÔNG THUA,
// nhưng ở §4 nó không được đếm vào win_count lẫn loss_count.
func WinLoss(net decimal.Decimal) int {
	if net.IsNegative() {
		return 0
	}
	return 1
}

// WinSign trả 1 hoặc −1, dùng cho thuật toán chuỗi thắng/thua (§5.1).
func WinSign(net decimal.Decimal) int {
	if net.IsNegative() {
		return -1
	}
	return 1
}

// DateParts quy thời điểm vào lệnh (lưu UTC) về timezone của account rồi
// sinh các nhãn dùng để gom nhóm. Đây là chỗ DUY NHẤT trong hệ thống quyết
// định một lệnh thuộc về ngày nào — mọi biểu đồ theo ngày/tuần/tháng/thứ đều
// bắt nguồn từ đây.
//
// Tuần theo ISO-8601 (spec quyết định #5), không phải WEEKNUM kiểu Excel.
//
// weekSort là khoá gom nhóm/sắp xếp riêng, không hiển thị: "YYYY-Www" với năm
// ISO đầy đủ và tuần zero-pad hai chữ số. week (nhãn hiển thị, "W24") tự nó
// không đủ để sort đúng ("W10" < "W2" theo lexical) và không phân biệt được
// hai năm có cùng số tuần — weekSort giải quyết cả hai, theo đúng cách
// charts.go xử lý nhãn tháng.
func DateParts(enteredAt time.Time, loc *time.Location) (day, week, weekSort, month, weekday string) {
	local := enteredAt.In(loc)
	isoYear, isoWeek := local.ISOWeek()
	return local.Format("2006-01-02"),
		fmt.Sprintf("W%d", isoWeek),
		fmt.Sprintf("%04d-W%02d", isoYear, isoWeek),
		local.Format("01/2006"),
		local.Format("Mon")
}
