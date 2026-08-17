package metrics

import (
	"fmt"
	"sort"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/scoring"
)

// DefaultTimezone dùng khi account chưa đặt timezone.
const DefaultTimezone = "Asia/Ho_Chi_Minh"

// Enriched là một lệnh kèm toàn bộ trường suy diễn. Không có gì ở đây được
// lưu xuống DB — tất cả tính lại mỗi lần đọc.
type Enriched struct {
	Trade domain.Trade

	Net     decimal.Decimal
	WinLoss int
	WinSign int

	ScoreEntry   int
	ScoreExit    int
	ScoreInTrade int
	ScorePsych   int
	ScoreTotal   *int
	TradeClass   string

	Day     string // "2026-06-09" theo timezone của account
	Week    string // "W24", ISO-8601
	Month   string // "06/2026"
	Weekday string // "Tue"

	CumByTrade  decimal.Decimal
	CumByDay    decimal.Decimal
	CumTheory   decimal.Decimal
	RunningPeak decimal.Decimal
	Drawdown    decimal.Decimal
}

// Enrich tính mọi trường suy diễn cho một danh sách lệnh CỦA CÙNG MỘT account.
// Trộn lệnh của nhiều account vào đây sẽ cho lũy kế sai.
//
// Đầu vào không cần sắp xếp sẵn — hàm tự sort theo STT vì mọi trường lũy kế
// phụ thuộc thứ tự đó.
//
// Lỗi duy nhất có thể xảy ra là timezone của account không phải tên IANA hợp lệ.
func Enrich(trades []domain.Trade, acc domain.Account) ([]Enriched, error) {
	tzName := acc.Timezone
	if tzName == "" {
		tzName = DefaultTimezone
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		return nil, fmt.Errorf("timezone %q của account không hợp lệ: %w", tzName, err)
	}

	sorted := make([]domain.Trade, len(trades))
	copy(sorted, trades)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].STT < sorted[j].STT })

	rows := make([]Enriched, 0, len(sorted))

	cum := decimal.Zero
	cumTheory := decimal.Zero
	peak := decimal.Zero // sàn tại 0 theo §3.7

	// Tổng net theo từng ngày, dùng để dựng cum_by_day ở lượt thứ hai.
	netByDay := map[string]decimal.Decimal{}

	for _, t := range sorted {
		net := Net(t)
		cum = cum.Add(net)

		if t.ProfitTheory != nil {
			cumTheory = cumTheory.Add(*t.ProfitTheory)
		}

		if cum.GreaterThan(peak) {
			peak = cum
		}

		day, week, month, weekday := DateParts(t.EnteredAt, loc)
		netByDay[day] = netByDay[day].Add(net)

		total := scoring.Total(t.EntryQuality, t.InTradeQuality, t.ExitQuality, t.Psychology)

		rows = append(rows, Enriched{
			Trade:        t,
			Net:          net,
			WinLoss:      WinLoss(net),
			WinSign:      WinSign(net),
			ScoreEntry:   scoring.Entry(t.EntryQuality),
			ScoreExit:    scoring.Exit(t.ExitQuality),
			ScoreInTrade: scoring.InTrade(t.InTradeQuality),
			ScorePsych:   scoring.Psych(t.Psychology),
			ScoreTotal:   total,
			TradeClass:   scoring.Classify(total),
			Day:          day,
			Week:         week,
			Month:        month,
			Weekday:      weekday,
			CumByTrade:   cum,
			CumTheory:    cumTheory,
			RunningPeak:  peak,
			Drawdown:     peak.Sub(cum),
		})
	}

	fillCumByDay(rows, netByDay)
	return rows, nil
}

// fillCumByDay gán cum_by_day = tổng net của MỌI ngày <= ngày của lệnh đó.
// Định nghĩa theo ngày (không theo thứ tự STT) nên kết quả không đổi khi
// người dùng nhập lệnh của một ngày cũ vào sau — đúng ý "lũy kế tới hết ngày" ở §3.5.
func fillCumByDay(rows []Enriched, netByDay map[string]decimal.Decimal) {
	days := make([]string, 0, len(netByDay))
	for d := range netByDay {
		days = append(days, d)
	}
	sort.Strings(days) // định dạng YYYY-MM-DD nên sort chuỗi = sort ngày

	cumByDay := make(map[string]decimal.Decimal, len(days))
	running := decimal.Zero
	for _, d := range days {
		running = running.Add(netByDay[d])
		cumByDay[d] = running
	}

	for i := range rows {
		rows[i].CumByDay = cumByDay[rows[i].Day]
	}
}
