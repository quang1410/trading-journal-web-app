package aggregate

import (
	"sort"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// PeriodPoint là một điểm trên sparkline của thẻ kỳ.
//
// CumByTrade là giá trị TOÀN CỤC, không rebase về 0 tại đầu kỳ: đường trên thẻ
// là một ĐOẠN của đường equity thật. Rebase làm thẻ đẹp hơn nhưng nói sai về
// vị trí tài khoản — cùng lý lẽ đã chốt cho chuỗi lý thuyết-vs-thực tế ở quy
// tắc 8 của CLAUDE.md.
type PeriodPoint struct {
	STT        int             `json:"stt"`
	CumByTrade decimal.Decimal `json:"cum_by_trade"`
}

// PeriodStat là một ngày hoặc một tuần trên tab Ngày/Tuần.
//
// KPI nhúng nguyên metrics.KPI thay vì chép lại từng trường: mọi chỉ số trên
// thẻ đã có định nghĩa đúng và có test ở đó. Chép ra sẽ tạo một bản sao trôi
// lệch khỏi bản gốc ở lần sửa công thức tiếp theo.
//
// CurrentBalance và NetCashFlow bên trong KPI luôn bằng 0 ở đây và KHÔNG có
// nghĩa: số dư là một mốc tại một thời điểm, không phải đại lượng của một
// khoảng. Tầng DTO ở httpapi cắt chúng khỏi JSON.
type PeriodStat struct {
	Key    string          `json:"key"`   // "2026-09-21" | "2026-W39"
	Start  string          `json:"start"` // ngày đầu kỳ, "YYYY-MM-DD"
	End    string          `json:"end"`   // ngày cuối kỳ, "YYYY-MM-DD"
	KPI    metrics.KPI     `json:"kpi"`
	Volume decimal.Decimal `json:"volume"`
	Points []PeriodPoint   `json:"points"`
}

// Periods gom tập ĐÃ LỌC theo ngày hoặc tuần, mỗi nhóm một thẻ kèm KPI đầy đủ.
//
// Chỉ nhận `filtered`: mọi số trên thẻ đọc từ tập đã lọc, còn các trường lũy
// kế bên trong mỗi Enriched vốn đã là số tính từ TRỌN dãy vì metrics.Enrich
// chạy trước khi lọc (quy tắc 8). Không cần tập `all` nào để giữ quy tắc đó.
func Periods(filtered []metrics.Enriched, acc domain.Account, period domain.Period) []PeriodStat {
	keyOf, ok := periodKeyFunc(period)
	if !ok {
		return nil
	}

	// Gom theo khoá, GIỮ thứ tự stt bên trong mỗi nhóm: filtered đã sắp theo
	// stt từ Enrich, nên append tuần tự là đủ.
	groups := map[string][]metrics.Enriched{}
	order := make([]string, 0, len(filtered))
	for _, e := range filtered {
		k := keyOf(e)
		if _, seen := groups[k]; !seen {
			order = append(order, k)
		}
		groups[k] = append(groups[k], e)
	}

	// Sắp theo khoá tăng dần. Cả hai dạng khoá đều zero-pad nên thứ tự chuỗi
	// trùng thứ tự thời gian — đó là lý do ValidatePeriodKey ép zero-pad.
	sort.Strings(order)

	out := make([]PeriodStat, 0, len(order))
	for _, k := range order {
		rows := groups[k]
		start, end := periodBounds(period, rows[0], acc)
		out = append(out, PeriodStat{
			Key:    k,
			Start:  start,
			End:    end,
			KPI:    periodKPI(rows, acc),
			Volume: sumVolume(rows),
			Points: pointsOf(rows),
		})
	}
	return out
}

// periodKPI là ComputeKPI cho một kỳ, với MaxDrawdown tính LẠI trong phạm vi kỳ.
//
// Mọi trường khác của KPI đều là tổng/đếm/cực trị trên từng lệnh rời rạc, nên
// cắt tập lệnh ra là tự động đúng. MaxDrawdown thì không: ComputeKPI đọc
// Enriched.Drawdown, mà trường đó do metrics.Enrich tính so với đỉnh lũy kế
// của TOÀN tài khoản. Dán thẳng lên thẻ thì một ngày toàn lệnh thắng vẫn mang
// con số sụt giảm thừa kế từ đỉnh của một ngày trước đó — thẻ nói về một sự
// kiện không xảy ra trong ngày mà nó mô tả.
//
// Đây KHÔNG phải vi phạm quy tắc 8. Quy tắc 8 nói lũy kế không rebase theo bộ
// LỌC; ở đây phạm vi là chính định nghĩa của chỉ số — "sụt giảm lớn nhất
// trong ngày này" là một đại lượng của khoảng, cùng họ với NetProfit của kỳ,
// không phải một lát cắt của đường equity. Sparkline bên cạnh vẫn giữ
// CumByTrade toàn cục, nên vị trí thật của tài khoản không bị giấu đi.
//
// Truyền (rows, rows) cho ComputeKPI: số dư không có nghĩa ở cấp kỳ, nên không
// có tập "toàn bộ" nào cần đến ở đây. flows rỗng vì cùng lý do — NetCashFlow
// của một ngày không phải một đại lượng.
func periodKPI(rows []metrics.Enriched, acc domain.Account) metrics.KPI {
	k := metrics.ComputeKPI(rows, rows, acc, nil)
	k.MaxDrawdown = drawdownWithin(rows)
	return k
}

// drawdownWithin đo khoảng tụt sâu nhất từ một đỉnh nào đó TRONG kỳ.
//
// Đỉnh khởi tạo bằng lũy kế lúc BẮT ĐẦU kỳ — tức trước khi lệnh đầu tiên được
// tính, nên phải trừ Net của chính nó ra. Lấy thẳng CumByTrade của lệnh đầu là
// đo từ SAU lệnh đó: một ngày mở màn bằng lệnh thua -50 sẽ báo sụt giảm 0,
// giấu đúng phần mà người dùng vừa mất.
//
// Không khởi tạo bằng 0: mốc so sánh là vị trí thật của tài khoản lúc vào kỳ,
// nên một kỳ mà lũy kế đang âm không bị đọc thành "tụt từ 0".
func drawdownWithin(rows []metrics.Enriched) decimal.Decimal {
	if len(rows) == 0 {
		return decimal.Zero
	}
	peak := rows[0].CumByTrade.Sub(rows[0].Net)
	maxDD := decimal.Zero
	for _, e := range rows {
		if e.CumByTrade.GreaterThan(peak) {
			peak = e.CumByTrade
		}
		if dd := peak.Sub(e.CumByTrade); dd.GreaterThan(maxDD) {
			maxDD = dd
		}
	}
	return maxDD
}

// periodKeyFunc trả hàm lấy khoá kỳ của một lệnh, và false khi kỳ không hợp lệ.
//
// Khoá lấy THẲNG từ trường mà metrics.Enrich đã tính, không tự quy đổi lại từ
// EnteredAt: Enrich là chỗ duy nhất quyết định một lệnh thuộc ngày nào, và hai
// đường quy đổi song song sẽ lệch nhau ở đúng những lệnh sát nửa đêm.
func periodKeyFunc(period domain.Period) (func(metrics.Enriched) string, bool) {
	switch period {
	case domain.PeriodDay:
		return func(e metrics.Enriched) string { return e.Day }, true
	case domain.PeriodWeek:
		return func(e metrics.Enriched) string { return e.WeekSort }, true
	default:
		return nil, false
	}
}

// periodBounds trả ngày đầu và ngày cuối của kỳ chứa lệnh `sample`.
//
// Kỳ ngày: cả hai là chính ngày đó. Kỳ tuần: thứ Hai và Chủ nhật của tuần ISO,
// tính bằng cách lùi/tiến từ chính thời điểm của lệnh trong timezone account —
// không phân tích chuỗi khoá, vì khoá tuần không chứa đủ thông tin để dựng
// lại ngày mà không lặp lại luật ISO lần thứ hai.
func periodBounds(period domain.Period, sample metrics.Enriched, acc domain.Account) (string, string) {
	if period == domain.PeriodDay {
		return sample.Day, sample.Day
	}
	loc, err := time.LoadLocation(acc.Timezone)
	if err != nil {
		// Enrich đã từ chối timezone sai trước khi tới đây, nên nhánh này chỉ
		// còn là lưới an toàn: trả chính ngày của lệnh thay vì panic.
		return sample.Day, sample.Day
	}
	local := sample.Trade.EnteredAt.In(loc)
	// time.Weekday() cho Chủ nhật = 0; tuần ISO bắt đầu thứ Hai nên Chủ nhật
	// phải tính là ngày thứ 7, không phải ngày thứ 0.
	offset := (int(local.Weekday()) + 6) % 7
	monday := local.AddDate(0, 0, -offset)
	sunday := monday.AddDate(0, 0, 6)
	return monday.Format("2006-01-02"), sunday.Format("2006-01-02")
}

// sumVolume cộng volume của các lệnh CÓ volume.
//
// Lệnh để trống volume không đóng góp và cũng không làm tổng thành "không xác
// định": một lệnh thiếu khối lượng vẫn là một lệnh thật, chỉ là chưa ghi đủ.
func sumVolume(rows []metrics.Enriched) decimal.Decimal {
	sum := decimal.Zero
	for _, e := range rows {
		if e.Trade.Volume != nil {
			sum = sum.Add(*e.Trade.Volume)
		}
	}
	return sum
}

func pointsOf(rows []metrics.Enriched) []PeriodPoint {
	out := make([]PeriodPoint, 0, len(rows))
	for _, e := range rows {
		out = append(out, PeriodPoint{STT: e.Trade.STT, CumByTrade: e.CumByTrade})
	}
	return out
}
