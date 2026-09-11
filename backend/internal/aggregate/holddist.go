package aggregate

import (
	"github.com/shopspring/decimal"

	"journal/internal/metrics"
)

// HoldBucket là một cột của histogram thời gian giữ lệnh.
//
// Có SumNet, khác RBucket: câu hỏi thật không phải "tôi hay giữ lệnh bao lâu"
// mà "khoảng giữ lệnh nào SINH LỜI". Một bucket đông lệnh nhưng âm tiền là
// đúng thứ cần nhìn thấy, và chỉ đếm số lệnh thì không thấy được.
type HoldBucket struct {
	Label  string          `json:"label"`
	Count  int             `json:"count"`
	Wins   int             `json:"wins"`
	Losses int             `json:"losses"`
	SumNet decimal.Decimal `json:"sum_net"`
}

// holdBucketDef mô tả một khoảng thời gian giữ lệnh, đơn vị GIÂY. Khoảng là
// nửa mở: lo <= x < hi. hasLo/hasHi = false nghĩa là vô cực về phía đó.
//
// Biên khai bằng int64 nên so sánh chính xác tuyệt đối, không có phép quy đổi
// dấu phẩy động nào lọt vào — cùng nguyên tắc như rBucketDef ở rdist.go.
type holdBucketDef struct {
	label string
	lo    int64
	hi    int64
	hasLo bool
	hasHi bool
}

// Sáu khoảng chọn theo nhịp giao dịch trong ngày: dưới 5 phút là scalp, trên
// một ngày là lệnh qua đêm. Nhãn tiếng Việt vì đây là DỮ LIỆU hiển thị cho
// người dùng, không phải định danh code (quy tắc 9).
var holdBucketDefs = []holdBucketDef{
	{label: "< 5m", hi: 300, hasHi: true},
	{label: "5m – 15m", lo: 300, hi: 900, hasLo: true, hasHi: true},
	{label: "15m – 1h", lo: 900, hi: 3600, hasLo: true, hasHi: true},
	{label: "1h – 4h", lo: 3600, hi: 14400, hasLo: true, hasHi: true},
	{label: "4h – 1 ngày", lo: 14400, hi: 86400, hasLo: true, hasHi: true},
	{label: "> 1 ngày", lo: 86400, hasLo: true},
}

// HoldDistribution đếm lệnh theo khoảng thời gian giữ.
//
// LUÔN trả đủ sáu bucket kể cả khi rỗng: biểu đồ phải giữ nguyên trục qua mọi
// bộ lọc, nếu không thì đổi tháng sẽ làm các cột nhảy chỗ.
//
// Lệnh không có HoldSeconds (chưa đóng, hoặc dữ liệu cũ) KHÔNG vào bucket nào.
// Xếp chúng vào bucket đầu sẽ là bịa ra một thời gian giữ bằng 0.
func HoldDistribution(rows []metrics.Enriched) []HoldBucket {
	buckets := make([]HoldBucket, len(holdBucketDefs))
	for i, d := range holdBucketDefs {
		buckets[i] = HoldBucket{Label: d.label, SumNet: decimal.Zero}
	}

	for _, r := range rows {
		if r.HoldSeconds == nil {
			continue
		}
		idx := holdBucketIndex(*r.HoldSeconds)
		if idx < 0 {
			continue
		}
		buckets[idx].Count++
		buckets[idx].SumNet = buckets[idx].SumNet.Add(r.Net)
		switch {
		case r.Net.IsPositive():
			buckets[idx].Wins++
		case r.Net.IsNegative():
			buckets[idx].Losses++
		}
		// net == 0: chỉ tăng Count, không phải Win cũng không phải Loss.
	}
	return buckets
}

// holdBucketIndex trả chỉ số bucket chứa giá trị, hoặc -1 nếu không bucket nào
// chứa. Sáu khoảng phủ kín từ 0 tới vô cực nên -1 chỉ xảy ra với giá trị ÂM,
// vốn đã bị domain.ValidateTrade chặn — giữ nhánh này để một dữ liệu hỏng lọt
// qua bằng đường khác không âm thầm rơi vào bucket đầu.
func holdBucketIndex(seconds int64) int {
	for i, d := range holdBucketDefs {
		if d.hasLo && seconds < d.lo {
			continue
		}
		if d.hasHi && seconds >= d.hi {
			continue
		}
		return i
	}
	return -1
}
