package aggregate

import (
	"github.com/shopspring/decimal"

	"journal/internal/metrics"
)

// RBucket là một cột của histogram phân phối R.
type RBucket struct {
	Label  string `json:"label"`
	Count  int    `json:"count"`
	Wins   int    `json:"wins"`
	Losses int    `json:"losses"`
}

// rBucketDef mô tả một khoảng R. Khoảng là nửa mở trên trục số: lo <= r < hi.
// hasLo/hasHi = false nghĩa là vô cực về phía đó. lo/hi luôn là số nguyên nên
// so sánh bằng decimal.Decimal chính xác tuyệt đối — không quy đổi qua float64
// (tiền/tỉ lệ tiền không bao giờ đi qua float64 trong package này).
//
// Hệ quả cho các bucket âm: bucket chứa đầu SÂU HƠN và không chứa đầu gần 0.
// Đúng -1R rơi vào "0R to -1R"; đúng -2R rơi vào "-1R to -2R". Không có lệnh
// nào bị đếm hai lần hoặc lọt khe.
type rBucketDef struct {
	label string
	lo    int64
	hi    int64
	hasLo bool
	hasHi bool
}

// Thứ tự và nhãn lấy nguyên văn từ trading-journal-plan.md §5.9, kể cả nhãn
// "5R to R6" viết nhầm trong sheet gốc — giữ nguyên để khớp với file cũ.
var rBucketDefs = []rBucketDef{
	{label: "Dưới -20R", hi: -20, hasHi: true},
	{label: "-15R to -20R", lo: -20, hi: -15, hasLo: true, hasHi: true},
	{label: "-10R to -15R", lo: -15, hi: -10, hasLo: true, hasHi: true},
	{label: "-8R to -10R", lo: -10, hi: -8, hasLo: true, hasHi: true},
	{label: "-6R to -8R", lo: -8, hi: -6, hasLo: true, hasHi: true},
	{label: "-5R to -6R", lo: -6, hi: -5, hasLo: true, hasHi: true},
	{label: "-4R to -5R", lo: -5, hi: -4, hasLo: true, hasHi: true},
	{label: "-3R to -4R", lo: -4, hi: -3, hasLo: true, hasHi: true},
	{label: "-2R to -3R", lo: -3, hi: -2, hasLo: true, hasHi: true},
	{label: "-1R to -2R", lo: -2, hi: -1, hasLo: true, hasHi: true},
	{label: "0R to -1R", lo: -1, hi: 0, hasLo: true, hasHi: true},
	{label: "0R to 1R", lo: 0, hi: 1, hasLo: true, hasHi: true},
	{label: "1R to 2R", lo: 1, hi: 2, hasLo: true, hasHi: true},
	{label: "2R to 3R", lo: 2, hi: 3, hasLo: true, hasHi: true},
	{label: "3R to 4R", lo: 3, hi: 4, hasLo: true, hasHi: true},
	{label: "4R to 5R", lo: 4, hi: 5, hasLo: true, hasHi: true},
	{label: "5R to R6", lo: 5, hi: 6, hasLo: true, hasHi: true},
	{label: "6R to 8R", lo: 6, hi: 8, hasLo: true, hasHi: true},
	{label: "8R to 10R", lo: 8, hi: 10, hasLo: true, hasHi: true},
	{label: "10R to 15R", lo: 10, hi: 15, hasLo: true, hasHi: true},
	{label: "15R to 20R", lo: 15, hi: 20, hasLo: true, hasHi: true},
	{label: "Trên 20R", lo: 20, hasLo: true},
}

// RDistribution xếp mỗi lệnh vào bucket theo R = net / oneR (§5.9).
// Luôn trả đủ 22 bucket theo đúng thứ tự, kể cả bucket rỗng, để biểu đồ giữ
// nguyên trục qua các lần lọc. oneR = 0 thì không xếp lệnh nào (tránh chia 0).
func RDistribution(rows []metrics.Enriched, oneR decimal.Decimal) []RBucket {
	buckets := make([]RBucket, len(rBucketDefs))
	for i, d := range rBucketDefs {
		buckets[i] = RBucket{Label: d.label}
	}
	if oneR.IsZero() {
		return buckets
	}

	for _, r := range rows {
		ratio := r.Net.Div(oneR)
		idx := bucketIndex(ratio)
		buckets[idx].Count++
		if r.Net.IsNegative() {
			buckets[idx].Losses++
			continue
		}
		buckets[idx].Wins++
	}
	return buckets
}

func bucketIndex(ratio decimal.Decimal) int {
	for i, d := range rBucketDefs {
		if d.hasLo && ratio.LessThan(decimal.NewFromInt(d.lo)) {
			continue
		}
		if d.hasHi && !ratio.LessThan(decimal.NewFromInt(d.hi)) {
			continue
		}
		return i
	}
	return len(rBucketDefs) - 1
}
