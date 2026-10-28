package domain

import (
	"encoding/json"
	"fmt"
	"sort"
)

// MinuteBars là nến 1 phút CME (NQ, ES) của trang /replay, theo cột và tăng dần theo giờ. T là giây
// Unix lúc mở nến. Giá và volume giữ nguyên chuỗi số nguồn gửi (json.Number) — không đi qua float64
// nên không lệch chữ số nào, từ TradingView tới DB tới trình duyệt.
//
// Sáu cột luôn đi cùng nhau, nên mọi thao tác trên chúng (thêm, cắt, kiểm tra) nằm ở đây thay vì
// mỗi nơi dùng tự viết lại sáu dòng.
type MinuteBars struct {
	T []int64       `json:"t"`
	O []json.Number `json:"o"`
	H []json.Number `json:"h"`
	L []json.Number `json:"l"`
	C []json.Number `json:"c"`
	V []json.Number `json:"v"`
}

// Len là số nến.
func (b MinuteBars) Len() int { return len(b.T) }

// Append thêm một nến vào cuối. Người gọi giữ thứ tự tăng dần.
func (b *MinuteBars) Append(t int64, o, h, l, c, v json.Number) {
	b.T, b.O, b.H, b.L, b.C, b.V = append(b.T, t), append(b.O, o), append(b.H, h), append(b.L, l), append(b.C, c), append(b.V, v)
}

// Validate báo lỗi khi sáu cột lệch độ dài hoặc giờ không tăng hẳn — dữ liệu như vậy ghi vào DB
// sẽ ra nến ghép sai cột hoặc hai nến cùng một phút.
func (b MinuteBars) Validate() error {
	n := len(b.T)
	if len(b.O) != n || len(b.H) != n || len(b.L) != n || len(b.C) != n || len(b.V) != n {
		return fmt.Errorf("minute bars: columns have different lengths (t=%d o=%d h=%d l=%d c=%d v=%d)", n, len(b.O), len(b.H), len(b.L), len(b.C), len(b.V))
	}
	for i := 1; i < n; i++ {
		if b.T[i] <= b.T[i-1] {
			return fmt.Errorf("minute bars: time does not increase at index %d (%d after %d)", i, b.T[i], b.T[i-1])
		}
	}
	return nil
}

// After giữ các nến mở SAU since (không gồm since). Nến đã tăng dần nên cắt một lần là đủ.
func (b MinuteBars) After(since int64) MinuteBars {
	i := sort.Search(len(b.T), func(i int) bool { return b.T[i] > since })
	return MinuteBars{T: b.T[i:], O: b.O[i:], H: b.H[i:], L: b.L[i:], C: b.C[i:], V: b.V[i:]}
}

// Before giữ các nến mở TRƯỚC until (không gồm until).
func (b MinuteBars) Before(until int64) MinuteBars {
	i := sort.Search(len(b.T), func(i int) bool { return b.T[i] >= until })
	return MinuteBars{T: b.T[:i], O: b.O[:i], H: b.H[:i], L: b.L[:i], C: b.C[:i], V: b.V[:i]}
}

// Except giữ những nến của b ở phút other KHÔNG có.
func (b MinuteBars) Except(other MinuteBars) MinuteBars {
	var out MinuteBars
	j := 0
	for i, t := range b.T {
		for j < other.Len() && other.T[j] < t {
			j++
		}
		if j < other.Len() && other.T[j] == t {
			continue
		}
		out.Append(t, b.O[i], b.H[i], b.L[i], b.C[i], b.V[i])
	}
	return out
}

// FillFrom trả b cộng thêm những nến của other ở phút b còn trống, vẫn tăng dần. Phút có ở cả hai
// thì giữ bản của b — nguồn chính thắng, nguồn phụ chỉ lấp chỗ trống.
func (b MinuteBars) FillFrom(other MinuteBars) MinuteBars {
	var out MinuteBars
	i, j := 0, 0
	for i < b.Len() || j < other.Len() {
		switch {
		case j >= other.Len() || (i < b.Len() && b.T[i] <= other.T[j]):
			if j < other.Len() && b.T[i] == other.T[j] {
				j++
			}
			out.Append(b.T[i], b.O[i], b.H[i], b.L[i], b.C[i], b.V[i])
			i++
		default:
			out.Append(other.T[j], other.O[j], other.H[j], other.L[j], other.C[j], other.V[j])
			j++
		}
	}
	return out
}

// OrEmpty đổi cột nil thành mảng rỗng, để JSON ra [] chứ không ra null: frontend đọc thẳng mỗi cột
// thành mảng số.
func (b MinuteBars) OrEmpty() MinuteBars {
	or := func(n []json.Number) []json.Number {
		if n == nil {
			return []json.Number{}
		}
		return n
	}
	if b.T == nil {
		b.T = []int64{}
	}
	b.O, b.H, b.L, b.C, b.V = or(b.O), or(b.H), or(b.L), or(b.C), or(b.V)
	return b
}
